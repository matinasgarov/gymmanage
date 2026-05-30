"use server";

import { getActorDb, type Actor } from "@/lib/actor";
import { parseScanToken, verifyScanToken } from "@/lib/qr";
import { ensurePendingPayments, computeEffectiveStatus } from "@/lib/payments";
import { verifyVisitorPassScan } from "@/lib/visitor-actions";

export type ScanResult =
  | {
      ok: true;
      member: {
        id: string;
        name: string;
        publicId: string;
        photoUrl: string | null;
        status: string;
        expiryDate: string;
      };
      checkInId: string;
    }
  | {
      ok: false;
      reason: string;
      member?: {
        id: string;
        name: string;
        publicId: string;
        photoUrl: string | null;
      };
      canOverride?: boolean;
    };

const REASON: Record<string, string> = {
  format: "QR kodu yanlışdır",
  expired: "QR kodu vaxtı keçib — yenilənməsini gözləyin",
  invalid: "QR kodu etibarsızdır",
  wrong_gym: "Bu zalın üzvü deyil",
  not_found: "Üzv tapılmadı",
  FROZEN: "Üzvlük dondurulub",
  EXPIRED: "Üzvlük başa çatıb",
  CANCELLED: "Üzvlük ləğv edilib",
  PAYMENT: "Ödəniş gözlənilir",
};

// Accept either a raw rotating token, or a URL containing ?t=TOKEN
function extractToken(input: string): string {
  try {
    const url = new URL(input);
    const t = url.searchParams.get("t");
    if (t) return t;
  } catch {
    // not a URL — fall through
  }
  return input.trim();
}

function actorGymId(actor: Actor): string {
  return actor.kind === "user" ? actor.user.gymId : actor.device.gymId;
}

// Attribution helper: a scan is performed by either a user (session) or a paired
// scanner device. Exactly one of scannedById / scannerDeviceId is set on the
// CheckIn row.
function attribution(actor: Actor): {
  scannedById: string | null;
  scannerDeviceId: string | null;
} {
  if (actor.kind === "user") {
    return { scannedById: actor.user.id, scannerDeviceId: null };
  }
  return { scannedById: null, scannerDeviceId: actor.device.id };
}

function canOverride(actor: Actor): boolean {
  return actor.kind === "user" && actor.user.role === "OWNER";
}

export async function verifyScan(raw: string): Promise<ScanResult> {
  const { actor, db } = await getActorDb();
  const gymId = actorGymId(actor);
  const token = extractToken(raw);
  const parsed = parseScanToken(token);

  // Visitor day-pass tokens are opaque base64url and don't match the
  // memberId.window.hmac format. Try them as a fallback.
  if (!parsed) {
    const v = await verifyVisitorPassScan(token);
    if (v.visitorPassId) {
      const memberInfo = {
        id: v.visitorPassId,
        name: v.name ?? "Qonaq",
        publicId: "Qonaq",
        photoUrl: null,
      };
      if (v.ok) {
        return {
          ok: true,
          member: {
            ...memberInfo,
            status: "ACTIVE",
            expiryDate: (v.expiresAt ?? "").slice(0, 10),
          },
          checkInId: "",
        };
      }
      return {
        ok: false,
        reason: v.reason ?? REASON.invalid,
        member: memberInfo,
      };
    }
    return { ok: false, reason: REASON.format };
  }

  // Cross-gym safety: look up member scoped to this gym
  const member = await db.member.findFirst({
    where: { id: parsed.memberId },
    select: {
      id: true,
      gymId: true,
      name: true,
      publicId: true,
      photoUrl: true,
      status: true,
      qrSecret: true,
      expiryDate: true,
    },
  });
  if (!member) {
    // Could be wrong-gym or non-existent. Don't leak which.
    return { ok: false, reason: REASON.wrong_gym };
  }

  const sig = verifyScanToken(token, (mid) => (mid === member.id ? member.qrSecret : null));
  if (!sig.ok) {
    return { ok: false, reason: REASON[sig.reason] };
  }

  const memberInfo = {
    id: member.id,
    name: member.name,
    publicId: member.publicId,
    photoUrl: member.photoUrl,
  };

  // Status checks
  if (member.status === "FROZEN" || member.status === "EXPIRED" || member.status === "CANCELLED") {
    await db.checkIn.create({
      data: {
        gymId,
        memberId: member.id,
        ...attribution(actor),
        result: "DENIED",
        deniedReason: REASON[member.status],
      },
    });
    return {
      ok: false,
      reason: REASON[member.status],
      member: memberInfo,
      canOverride: canOverride(actor),
    };
  }

  // Payment check for the current period
  await ensurePendingPayments(member.id);
  const today = new Date();
  const currentPayment = await db.payment.findFirst({
    where: {
      memberId: member.id,
      dueDate: { lte: today },
    },
    orderBy: { dueDate: "desc" },
  });

  if (currentPayment) {
    const eff = computeEffectiveStatus(currentPayment);
    if (eff !== "PAID") {
      await db.checkIn.create({
        data: {
          gymId,
          memberId: member.id,
          ...attribution(actor),
          result: "DENIED",
          deniedReason: REASON.PAYMENT,
        },
      });
      return {
        ok: false,
        reason: REASON.PAYMENT,
        member: memberInfo,
        canOverride: canOverride(actor),
      };
    }
  }

  // Granted
  const checkIn = await db.checkIn.create({
    data: {
      gymId,
      memberId: member.id,
      ...attribution(actor),
      result: "GRANTED",
    },
  });

  return {
    ok: true,
    member: {
      ...memberInfo,
      status: member.status,
      expiryDate: member.expiryDate.toISOString().slice(0, 10),
    },
    checkInId: checkIn.id,
  };
}

// Owner-only: override a denied scan. Devices cannot override — they'd be
// rejected by the role check.
export async function overrideScan(memberId: string, note: string) {
  const { actor, db } = await getActorDb();
  if (actor.kind !== "user" || actor.user.role !== "OWNER") return { ok: false };
  const user = actor.user;

  const member = await db.member.findFirst({
    where: { id: memberId },
    select: { id: true },
  });
  if (!member) return { ok: false };

  const checkIn = await db.checkIn.create({
    data: {
      gymId: user.gymId,
      memberId: member.id,
      scannedById: user.id,
      result: "GRANTED",
      override: true,
      overrideNote: note || null,
    },
  });

  await db.auditLog.create({
    data: {
      gymId: user.gymId,
      actorId: user.id,
      action: "checkin.override",
      entityType: "CheckIn",
      entityId: checkIn.id,
      payload: { memberId: member.id, note },
    },
  });

  return { ok: true, checkInId: checkIn.id };
}

// Used by manual-lookup fallback when member's phone is dead.
// Accessible by both user sessions and paired devices.
export async function manualLookup(query: string) {
  const { db } = await getActorDb();
  const q = query.trim();
  if (q.length < 2) return [];
  return db.member.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { publicId: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, publicId: true, phone: true, status: true },
    take: 8,
  });
}

// Manual entry from /door when the member's phone is dead. Same gates as
// verifyScan (status + current-period payment), but no token verification.
// Returns the same ScanResult shape so the UI can reuse the result screen.
export async function grantManualEntry(memberId: string): Promise<ScanResult> {
  const { actor, db } = await getActorDb();
  const gymId = actorGymId(actor);

  const member = await db.member.findFirst({
    where: { id: memberId },
    select: {
      id: true,
      name: true,
      publicId: true,
      photoUrl: true,
      status: true,
      expiryDate: true,
    },
  });
  if (!member) return { ok: false, reason: REASON.not_found };

  const memberInfo = {
    id: member.id,
    name: member.name,
    publicId: member.publicId,
    photoUrl: member.photoUrl,
  };

  if (
    member.status === "FROZEN" ||
    member.status === "EXPIRED" ||
    member.status === "CANCELLED"
  ) {
    await db.checkIn.create({
      data: {
        gymId,
        memberId: member.id,
        ...attribution(actor),
        result: "DENIED",
        deniedReason: REASON[member.status],
      },
    });
    return {
      ok: false,
      reason: REASON[member.status],
      member: memberInfo,
      canOverride: canOverride(actor),
    };
  }

  await ensurePendingPayments(member.id);
  const today = new Date();
  const currentPayment = await db.payment.findFirst({
    where: { memberId: member.id, dueDate: { lte: today } },
    orderBy: { dueDate: "desc" },
  });
  if (currentPayment) {
    const eff = computeEffectiveStatus(currentPayment);
    if (eff !== "PAID") {
      await db.checkIn.create({
        data: {
          gymId,
          memberId: member.id,
          ...attribution(actor),
          result: "DENIED",
          deniedReason: REASON.PAYMENT,
        },
      });
      return {
        ok: false,
        reason: REASON.PAYMENT,
        member: memberInfo,
        canOverride: canOverride(actor),
      };
    }
  }

  const checkIn = await db.checkIn.create({
    data: {
      gymId,
      memberId: member.id,
      ...attribution(actor),
      result: "GRANTED",
    },
  });

  return {
    ok: true,
    member: {
      ...memberInfo,
      status: member.status,
      expiryDate: member.expiryDate.toISOString().slice(0, 10),
    },
    checkInId: checkIn.id,
  };
}
