"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOwnerDb } from "@/lib/dal";
import { getActorDb, type Actor } from "@/lib/actor";

function visitorAttribution(actor: Actor): {
  scannedById: string | null;
  scannerDeviceId: string | null;
} {
  if (actor.kind === "user") {
    return { scannedById: actor.user.id, scannerDeviceId: null };
  }
  return { scannedById: null, scannerDeviceId: actor.device.id };
}

function visitorGymId(actor: Actor): string {
  return actor.kind === "user" ? actor.user.gymId : actor.device.gymId;
}

const visitorSchema = z.object({
  amount: z.coerce
    .number()
    .positive("Məbləğ 0-dan böyük olmalıdır")
    .max(9999, "Məbləğ çox böyükdür"),
  method: z.enum(["CASH", "CARD", "TRANSFER"]),
  name: z
    .union([z.literal(""), z.string().max(120)])
    .transform((v) => (v === "" ? null : v.trim())),
  phone: z
    .union([z.literal(""), z.string().regex(/^\+994\d{9}$/, "Telefon +994XXXXXXXXX")])
    .transform((v) => (v === "" ? null : v)),
});

export type VisitorFormState =
  | {
      ok?: true;
      message?: string;
      errors?: Record<string, string[]>;
      passUrl?: string;
    }
  | undefined;

function endOfDayUtc(now = new Date()): Date {
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    23, 59, 59
  ));
}

function originFromHeaders(host: string | null, proto: string | null): string {
  return `${proto ?? "http"}://${host ?? "localhost:3000"}`;
}

export async function recordQuickVisit(
  _prev: VisitorFormState,
  formData: FormData
): Promise<VisitorFormState> {
  const { user, db } = await getOwnerDb();
  const parsed = visitorSchema.safeParse({
    amount: formData.get("amount"),
    method: formData.get("method"),
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const data = parsed.data;
  const expiresAt = endOfDayUtc();

  await db.$transaction(async (tx) => {
    const pass = await tx.visitorPass.create({
      data: {
        gymId: user.gymId,
        name: data.name,
        phone: data.phone,
        amount: data.amount,
        method: data.method,
        token: null,
        expiresAt,
        recordedById: user.id,
      },
    });
    await tx.checkIn.create({
      data: {
        gymId: user.gymId,
        visitorPassId: pass.id,
        scannedById: user.id,
        result: "GRANTED",
      },
    });
    await tx.auditLog.create({
      data: {
        gymId: user.gymId,
        actorId: user.id,
        action: "visitor.quick_entry",
        entityType: "VisitorPass",
        entityId: pass.id,
        payload: {
          amount: data.amount.toString(),
          method: data.method,
          name: data.name,
        },
      },
    });
  });

  revalidatePath("/dashboard");
  revalidatePath("/visitors");
  revalidatePath("/scan");
  return { ok: true, message: "Giriş qeydə alındı" };
}

export async function issueDayPass(
  _prev: VisitorFormState,
  formData: FormData
): Promise<VisitorFormState> {
  const { user, db } = await getOwnerDb();
  const parsed = visitorSchema.safeParse({
    amount: formData.get("amount"),
    method: formData.get("method"),
    name: formData.get("name") ?? "",
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const data = parsed.data;
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = endOfDayUtc();

  const pass = await db.$transaction(async (tx) => {
    const p = await tx.visitorPass.create({
      data: {
        gymId: user.gymId,
        name: data.name,
        phone: data.phone,
        amount: data.amount,
        method: data.method,
        token,
        expiresAt,
        recordedById: user.id,
      },
    });
    await tx.auditLog.create({
      data: {
        gymId: user.gymId,
        actorId: user.id,
        action: "visitor.day_pass_issued",
        entityType: "VisitorPass",
        entityId: p.id,
        payload: {
          amount: data.amount.toString(),
          method: data.method,
          name: data.name,
        },
      },
    });
    return p;
  });

  // Page builds the absolute URL using its own headers; here we return the path.
  const passPath = `/visit/${pass.id}/${token}`;
  revalidatePath("/dashboard");
  revalidatePath("/visitors");
  return { ok: true, message: "Günlük QR yaradıldı", passUrl: passPath };
}

// Used by scanner when the scanned token doesn't look like a member rotating token.
// Accepts either a session user or a paired scanner device — same dispatch as
// verifyScan in scan-actions.ts. Pass *creation* (recordQuickVisit /
// issueDayPass) stays owner-only.
export async function verifyVisitorPassScan(token: string): Promise<{
  ok: boolean;
  reason?: string;
  visitorPassId?: string;
  name?: string | null;
  expiresAt?: string;
}> {
  const { actor, db } = await getActorDb();
  const gymId = visitorGymId(actor);
  const attribution = visitorAttribution(actor);

  const pass = await db.visitorPass.findFirst({
    where: { token },
    select: { id: true, name: true, expiresAt: true },
  });
  if (!pass) {
    return { ok: false, reason: "QR kodu tapılmadı" };
  }
  if (pass.expiresAt.getTime() < Date.now()) {
    await db.checkIn.create({
      data: {
        gymId,
        visitorPassId: pass.id,
        ...attribution,
        result: "DENIED",
        deniedReason: "Vaxtı keçib",
      },
    });
    return { ok: false, reason: "QR kodun vaxtı keçib", visitorPassId: pass.id };
  }

  await db.checkIn.create({
    data: {
      gymId,
      visitorPassId: pass.id,
      ...attribution,
      result: "GRANTED",
    },
  });

  return {
    ok: true,
    visitorPassId: pass.id,
    name: pass.name,
    expiresAt: pass.expiresAt.toISOString(),
  };
}
