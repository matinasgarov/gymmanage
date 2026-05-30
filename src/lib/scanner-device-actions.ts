"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOwnerDb } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { setDeviceCookie, hashDeviceToken } from "@/lib/device";

const PAIRING_RACE = Symbol("pairing-race");

const PAIRING_TTL_MS = 5 * 60 * 1000;

export type PairingResult =
  | { ok: true; deviceId: string; pairingCode: string; expiresAt: string }
  | { ok: false; message: string; errors?: Record<string, string[]> };

const nameSchema = z.object({
  name: z
    .string()
    .min(2, "Ad ən az 2 simvol olmalıdır")
    .max(40, "Ad çox uzundur")
    .trim(),
});

function freshPairingCode(): string {
  // 8 random bytes → 11 base64url chars. Plenty of entropy for a 5-minute window.
  return crypto.randomBytes(8).toString("base64url");
}

export async function createScannerPairing(
  _prev: PairingResult | undefined,
  formData: FormData
): Promise<PairingResult> {
  const { user, db } = await getOwnerDb();
  const parsed = nameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Ad düzgün deyil",
      errors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const pairingCode = freshPairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);

  const device = await db.scannerDevice.create({
    data: {
      gymId: user.gymId,
      name: parsed.data.name,
      pairingCode,
      pairingExpiresAt: expiresAt,
    },
    select: { id: true },
  });

  revalidatePath("/settings");
  return {
    ok: true,
    deviceId: device.id,
    pairingCode,
    expiresAt: expiresAt.toISOString(),
  };
}

// Regenerate a pairing code on an existing (still-unpaired) device row.
// Useful when the 5-minute window expired and the owner is still in the modal.
export async function regeneratePairing(
  deviceId: string
): Promise<PairingResult> {
  const { db } = await getOwnerDb();
  const existing = await db.scannerDevice.findFirst({
    where: { id: deviceId },
    select: { id: true, tokenHash: true, revokedAt: true },
  });
  if (!existing) return { ok: false, message: "Cihaz tapılmadı" };
  if (existing.tokenHash) return { ok: false, message: "Cihaz artıq qoşulub" };
  if (existing.revokedAt) return { ok: false, message: "Cihaz ləğv edilib" };

  const pairingCode = freshPairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);

  await db.scannerDevice.update({
    where: { id: deviceId },
    data: { pairingCode, pairingExpiresAt: expiresAt },
  });

  revalidatePath("/settings");
  return { ok: true, deviceId, pairingCode, expiresAt: expiresAt.toISOString() };
}

export async function revokeScannerDevice(
  deviceId: string
): Promise<{ ok: boolean; message?: string }> {
  const { user, db } = await getOwnerDb();
  const device = await db.scannerDevice.findFirst({
    where: { id: deviceId },
    select: { id: true, name: true, revokedAt: true },
  });
  if (!device) return { ok: false, message: "Cihaz tapılmadı" };
  if (device.revokedAt) return { ok: true };

  await db.$transaction(async (tx) => {
    await tx.scannerDevice.update({
      where: { id: deviceId },
      // Clear both credentials so neither the long-lived token nor any
      // outstanding pairing code can be used to re-authenticate post-revoke.
      data: { revokedAt: new Date(), tokenHash: null, pairingCode: null },
    });
    await tx.auditLog.create({
      data: {
        gymId: user.gymId,
        actorId: user.id,
        action: "device.revoked",
        entityType: "ScannerDevice",
        entityId: deviceId,
        payload: { name: device.name },
      },
    });
  });

  revalidatePath("/settings");
  return { ok: true };
}

export type RedeemResult =
  | { ok: true; gymName: string }
  | { ok: false; message: string };

// Public action — no auth. Called by /door/pair/[code]. Validates the code,
// mints a long-lived opaque token, stores sha256(token) on the device row,
// sets the gympass_scanner_device cookie on the phone, returns ok.
export async function redeemPairing(code: string): Promise<RedeemResult> {
  if (!code || code.length < 8 || code.length > 32) {
    return { ok: false, message: "Kod düzgün deyil" };
  }

  const device = await prisma.scannerDevice.findUnique({
    where: { pairingCode: code },
    select: {
      id: true,
      gymId: true,
      name: true,
      tokenHash: true,
      pairingExpiresAt: true,
      revokedAt: true,
      gym: { select: { name: true } },
    },
  });

  if (!device) return { ok: false, message: "Kod tapılmadı" };
  if (device.revokedAt) return { ok: false, message: "Cihaz ləğv edilib" };
  if (device.tokenHash) return { ok: false, message: "Kod artıq istifadə olunub" };
  if (!device.pairingExpiresAt || device.pairingExpiresAt.getTime() < Date.now()) {
    return { ok: false, message: "Kodun vaxtı keçib" };
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashDeviceToken(token);

  try {
    await prisma.$transaction(async (tx) => {
      // `updateMany` with the `tokenHash: null` filter is the race guard:
      // if a concurrent redeem already paired this row, count will be 0
      // and we abort the transaction. (Plain `update`'s where is a unique
      // input that doesn't accept `null` directly; updateMany takes a full
      // filter and is still atomic on a single row.)
      const updated = await tx.scannerDevice.updateMany({
        where: { id: device.id, tokenHash: null },
        data: {
          tokenHash,
          pairingCode: null,
          pairingExpiresAt: null,
          lastSeenAt: new Date(),
        },
      });
      if (updated.count === 0) {
        throw PAIRING_RACE;
      }
      await tx.auditLog.create({
        data: {
          gymId: device.gymId,
          actorId: null, // phone is unauthenticated at this point
          action: "device.paired",
          entityType: "ScannerDevice",
          entityId: device.id,
          payload: { name: device.name },
        },
      });
    });
  } catch (e) {
    if (e === PAIRING_RACE) {
      return { ok: false, message: "Kod artıq istifadə olunub" };
    }
    throw e;
  }

  await setDeviceCookie(token);
  return { ok: true, gymName: device.gym.name };
}
