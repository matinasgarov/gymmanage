"use server";

import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  signScanToken,
  verifyPassUrlToken,
  buildScanUrl,
  newPassDeviceToken,
  hashPassDevice,
} from "@/lib/qr";

const PASS_COOKIE_PREFIX = "gympass_pass_";
const ONE_YEAR_S = 365 * 24 * 60 * 60;

function passCookieName(memberId: string): string {
  return `${PASS_COOKIE_PREFIX}${memberId}`;
}

async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

async function readPassDeviceCookie(memberId: string): Promise<string | null> {
  const store = await cookies();
  return store.get(passCookieName(memberId))?.value ?? null;
}

async function setPassDeviceCookie(memberId: string, token: string) {
  const store = await cookies();
  store.set(passCookieName(memberId), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ONE_YEAR_S,
    path: "/",
  });
}

export type ScanTokenResult =
  | { status: "ok"; scanUrl: string; expiresAt: number }
  | { status: "needs_transfer" }
  | { status: "wrong_code" }
  | { status: "rate_limited" }
  | { status: "invalid" };

// Phone-verify transfer throttle: this many wrong codes locks transfer…
const MAX_TRANSFER_FAILS = 5;
// …for this long.
const TRANSFER_LOCK_MS = 15 * 60 * 1000;

// Last 4 digits of a stored phone, ignoring spaces/+/dashes.
function phoneLast4(phone: string): string {
  return (phone.match(/\d/g) ?? []).join("").slice(-4);
}

function digitsEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

async function issueScan(member: {
  id: string;
  qrSecret: string;
}): Promise<ScanTokenResult> {
  const { token, expiresAt } = signScanToken(member.id, member.qrSecret);
  const origin = await getOrigin();
  return { status: "ok", scanUrl: buildScanUrl(token, origin), expiresAt };
}

// Public. Mint a rotating scan token for the pass — but only for the device the
// pass is bound to. The first device to open an unbound pass claims it (silent
// bind); any other device gets `needs_transfer` and must call transferPassDevice.
// This is what blocks a shared URL: the link alone, without the bound device's
// httpOnly cookie, cannot generate QR codes.
export async function requestScanToken(
  memberId: string,
  urlToken: string
): Promise<ScanTokenResult> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, qrSecret: true, passDeviceHash: true },
  });
  if (!member) return { status: "invalid" };
  if (!verifyPassUrlToken(member.id, member.qrSecret, urlToken)) {
    return { status: "invalid" };
  }

  const cookieToken = await readPassDeviceCookie(memberId);

  // Not yet bound to any device → this device claims it.
  if (member.passDeviceHash == null) {
    const deviceToken = cookieToken ?? newPassDeviceToken();
    await setPassDeviceCookie(memberId, deviceToken);
    await prisma.member.update({
      where: { id: member.id },
      data: { passDeviceHash: hashPassDevice(deviceToken), passBoundAt: new Date() },
    });
    return issueScan(member);
  }

  // Bound device → serve tokens.
  if (cookieToken && hashPassDevice(cookieToken) === member.passDeviceHash) {
    return issueScan(member);
  }

  // Some other device holds the binding.
  return { status: "needs_transfer" };
}

// Public. Move the pass binding to the current device — but only after the
// caller proves they are the member by entering the last 4 digits of the phone
// on file. A forwarded link alone does not carry that knowledge, so a casual
// share cannot claim the QR. Overwrites the previous binding (the old phone
// immediately stops minting tokens) and is logged so an owner can spot a member
// who transfers constantly. Brute-force throttled: MAX_TRANSFER_FAILS wrong
// codes locks transfer for TRANSFER_LOCK_MS.
export async function transferPassDevice(
  memberId: string,
  urlToken: string,
  code: string
): Promise<ScanTokenResult> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      gymId: true,
      qrSecret: true,
      phone: true,
      passTransferFails: true,
      passTransferLockedUntil: true,
    },
  });
  if (!member) return { status: "invalid" };
  if (!verifyPassUrlToken(member.id, member.qrSecret, urlToken)) {
    return { status: "invalid" };
  }

  // Throttle: respect an active lock; clear an expired one before comparing.
  const now = Date.now();
  if (member.passTransferLockedUntil != null) {
    if (member.passTransferLockedUntil.getTime() > now) {
      return { status: "rate_limited" };
    }
    await prisma.member.update({
      where: { id: member.id },
      data: { passTransferFails: 0, passTransferLockedUntil: null },
    });
    member.passTransferFails = 0;
  }

  // Wrong code → count the failure, lock once the ceiling is hit.
  if (!digitsEqual((code.match(/\d/g) ?? []).join(""), phoneLast4(member.phone))) {
    const fails = member.passTransferFails + 1;
    const locked = fails >= MAX_TRANSFER_FAILS;
    await prisma.member.update({
      where: { id: member.id },
      data: {
        passTransferFails: fails,
        passTransferLockedUntil: locked ? new Date(now + TRANSFER_LOCK_MS) : null,
      },
    });
    return { status: locked ? "rate_limited" : "wrong_code" };
  }

  // Correct code → rebind, reset throttle, log, issue a fresh scan token.
  const deviceToken = newPassDeviceToken();
  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: member.id },
      data: {
        passDeviceHash: hashPassDevice(deviceToken),
        passBoundAt: new Date(),
        passTransferFails: 0,
        passTransferLockedUntil: null,
      },
    });
    await tx.auditLog.create({
      data: {
        gymId: member.gymId,
        actorId: null, // the member (not an authenticated user) initiated this
        action: "pass.device_transfer",
        entityType: "Member",
        entityId: member.id,
        payload: {},
      },
    });
  });
  await setPassDeviceCookie(memberId, deviceToken);

  return issueScan(member);
}
