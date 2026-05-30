"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOwnerDb } from "@/lib/dal";

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
