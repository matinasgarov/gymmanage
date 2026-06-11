"use server";

import { getActorDb, type Actor } from "@/lib/actor";
import type { GymDb } from "@/lib/tenant";
import type { PlanType } from "@/generated/prisma/enums";
import { parseScanToken, verifyScanToken } from "@/lib/qr";
import { ensurePendingPayments, computeDebt, periodsThrough, type DebtSummary } from "@/lib/payments";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n";
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
      debt?: { amount: number; periodLabel: string; graceDaysLeft: number };
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
  already_entered: "Bu gün artıq giriş edilib",
  limit_reached: "Aylıq giriş limiti dolub",
};

// Whether a capped member has used up their per-cycle entries. The cycle is the
// member's current billing period (latest period start from their startDate).
async function monthlyCapReached(
  db: GymDb,
  member: {
    id: string;
    startDate: Date;
    planType: PlanType;
    monthlyEntryLimit: number | null;
  }
): Promise<boolean> {
  if (member.monthlyEntryLimit == null) return false;
  const periods = periodsThrough(member.startDate, member.planType);
  const cycleStart = periods[periods.length - 1] ?? member.startDate;
  const used = await db.checkIn.count({
    where: { memberId: member.id, result: "GRANTED", scannedAt: { gte: cycleStart } },
  });
  return used >= member.monthlyEntryLimit;
}

// Debt gate shared by verifyScan and grantManualEntry: ensures payment rows
// exist, then summarizes everything unpaid and due. OVERDUE → deny upstream;
// PENDING (within grace) → grant with the debt attached.
//
// Deliberate behavior: the old code examined only the latest due payment;
// this aggregates ALL unpaid periods and denies if any is past grace.
async function assessPaymentDebt(
  db: GymDb,
  member: { id: string; planType: PlanType },
  gymLocale: string = DEFAULT_LOCALE
): Promise<DebtSummary | null> {
  await ensurePendingPayments(member.id);
  const now = new Date();
  const rows = await db.payment.findMany({
    where: {
      memberId: member.id,
      status: { not: "PAID" },
      paidAt: null,
      dueDate: { lte: now },
    },
    select: { status: true, dueDate: true, paidAt: true, amount: true },
  });
  const locale = isLocale(gymLocale) ? gymLocale : DEFAULT_LOCALE;
  return computeDebt(
    rows.map((r) => ({ ...r, amount: Number(r.amount.toString()) })),
    member.planType,
    locale,
    now
  );
}

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
      unlimitedEntries: true,
      startDate: true,
      planType: true,
      monthlyEntryLimit: true,
      gym: { select: { locale: true } },
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
  const debt = await assessPaymentDebt(db, member, member.gym?.locale ?? DEFAULT_LOCALE);
  if (debt && debt.effective === "OVERDUE") {
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

  // Once-per-day gate (skipped for unlimited-entries members)
  if (!member.unlimitedEntries) {
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const alreadyIn = await db.checkIn.findFirst({
      where: { memberId: member.id, result: "GRANTED", scannedAt: { gte: todayUtc } },
      select: { id: true },
    });
    if (alreadyIn) {
      await db.checkIn.create({
        data: {
          gymId,
          memberId: member.id,
          ...attribution(actor),
          result: "DENIED",
          deniedReason: REASON.already_entered,
        },
      });
      return {
        ok: false,
        reason: REASON.already_entered,
        member: memberInfo,
        canOverride: canOverride(actor),
      };
    }
  }

  // Monthly entry cap (per billing cycle)
  if (await monthlyCapReached(db, member)) {
    await db.checkIn.create({
      data: {
        gymId,
        memberId: member.id,
        ...attribution(actor),
        result: "DENIED",
        deniedReason: REASON.limit_reached,
      },
    });
    return {
      ok: false,
      reason: REASON.limit_reached,
      member: memberInfo,
      canOverride: canOverride(actor),
    };
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
    ...(debt
      ? { debt: { amount: debt.amount, periodLabel: debt.periodLabel, graceDaysLeft: debt.graceDaysLeft } }
      : {}),
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
      gymId: actorGymId(actor),
      memberId: member.id,
      ...attribution(actor),
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
      unlimitedEntries: true,
      startDate: true,
      planType: true,
      monthlyEntryLimit: true,
      gym: { select: { locale: true } },
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

  const debt = await assessPaymentDebt(db, member, member.gym?.locale ?? DEFAULT_LOCALE);
  if (debt && debt.effective === "OVERDUE") {
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

  if (!member.unlimitedEntries) {
    const todayUtc = new Date();
    todayUtc.setUTCHours(0, 0, 0, 0);
    const alreadyIn = await db.checkIn.findFirst({
      where: { memberId: member.id, result: "GRANTED", scannedAt: { gte: todayUtc } },
      select: { id: true },
    });
    if (alreadyIn) {
      await db.checkIn.create({
        data: {
          gymId,
          memberId: member.id,
          ...attribution(actor),
          result: "DENIED",
          deniedReason: REASON.already_entered,
        },
      });
      return {
        ok: false,
        reason: REASON.already_entered,
        member: memberInfo,
        canOverride: canOverride(actor),
      };
    }
  }

  if (await monthlyCapReached(db, member)) {
    await db.checkIn.create({
      data: {
        gymId,
        memberId: member.id,
        ...attribution(actor),
        result: "DENIED",
        deniedReason: REASON.limit_reached,
      },
    });
    return {
      ok: false,
      reason: REASON.limit_reached,
      member: memberInfo,
      canOverride: canOverride(actor),
    };
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
    ...(debt
      ? { debt: { amount: debt.amount, periodLabel: debt.periodLabel, graceDaysLeft: debt.graceDaysLeft } }
      : {}),
  };
}
