"use server";

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
  | { status: "invalid" };

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

// Public. Explicitly move the pass binding to the current device (overwrites the
// previous one, so the old phone immediately stops minting tokens). Logged so an
// owner can spot a member who transfers constantly — the signature of a shared link.
export async function transferPassDevice(
  memberId: string,
  urlToken: string
): Promise<ScanTokenResult> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { id: true, gymId: true, qrSecret: true },
  });
  if (!member) return { status: "invalid" };
  if (!verifyPassUrlToken(member.id, member.qrSecret, urlToken)) {
    return { status: "invalid" };
  }

  const deviceToken = newPassDeviceToken();
  await prisma.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: member.id },
      data: { passDeviceHash: hashPassDevice(deviceToken), passBoundAt: new Date() },
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
