import "server-only";
import { forGym } from "@/lib/tenant";
import { toCents, centsToNumber } from "@/lib/money";
import { REASON, REVENUE_DENIAL_REASONS } from "@/lib/scan-reasons";

// Locked: a payment counts as "collected after a reminder" only if a reminder was
// sent before payment and no more than 14 days before it.
const REMINDER_ATTRIBUTION_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export type BlockedReasonCount = { reason: string; count: number };

export type MonthlyRecap = {
  year: number;
  month: number; // 0-indexed (JS Date convention)
  reminderCollected: number; // AZN — paid this month within 14d after a reminder
  totalRevenue: number; // AZN — all collected this month (ratio denominator only)
  blockedCount: number; // revenue denials (owed money / invalid membership)
  blockedByReason: BlockedReasonCount[]; // reason = stored AZ string
  sharingSignalCount: number; // already_entered denials (ambiguous)
};

export async function getMonthlyRecap(
  gymId: string,
  year: number,
  month: number
): Promise<MonthlyRecap> {
  const db = forGym(gymId);
  const monthStart = new Date(Date.UTC(year, month, 1));
  const nextMonthStart = new Date(Date.UTC(year, month + 1, 1));

  const [paidThisMonth, visitorPasses, denials] = await Promise.all([
    db.payment.findMany({
      where: { status: "PAID", paidAt: { gte: monthStart, lt: nextMonthStart } },
      select: { id: true, amount: true, paidAt: true },
    }),
    db.visitorPass.findMany({
      where: { createdAt: { gte: monthStart, lt: nextMonthStart } },
      select: { amount: true },
    }),
    db.checkIn.findMany({
      where: { result: "DENIED", scannedAt: { gte: monthStart, lt: nextMonthStart } },
      select: { deniedReason: true },
    }),
  ]);

  // Total collected this month (member payments + visitor passes). Denominator only —
  // the Panel owns the headline revenue number; here it's just the ratio base.
  let totalCents = 0;
  for (const p of paidThisMonth) totalCents += toCents(p.amount);
  for (const v of visitorPasses) totalCents += toCents(v.amount);

  // Reminder-attributed revenue: earliest reminder per payment, within the window.
  let reminderCents = 0;
  const paidIds = paidThisMonth.map((p) => p.id);
  if (paidIds.length > 0) {
    const reminders = await db.auditLog.findMany({
      where: { action: "reminder.sent", entityType: "Payment", entityId: { in: paidIds } },
      select: { entityId: true, createdAt: true },
    });
    const firstReminder = new Map<string, Date>();
    for (const r of reminders) {
      const prev = firstReminder.get(r.entityId);
      if (!prev || r.createdAt < prev) firstReminder.set(r.entityId, r.createdAt);
    }
    for (const p of paidThisMonth) {
      if (!p.paidAt) continue;
      const rem = firstReminder.get(p.id);
      if (!rem) continue;
      const delta = p.paidAt.getTime() - rem.getTime();
      if (delta >= 0 && delta <= REMINDER_ATTRIBUTION_WINDOW_MS) {
        reminderCents += toCents(p.amount);
      }
    }
  }

  // Denials → blocked (revenue protection) vs sharing signal vs ignored.
  let blockedCount = 0;
  let sharingSignalCount = 0;
  const byReason = new Map<string, number>();
  for (const d of denials) {
    const reason = d.deniedReason ?? "";
    if (REVENUE_DENIAL_REASONS.includes(reason)) {
      blockedCount += 1;
      byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    } else if (reason === REASON.already_entered) {
      sharingSignalCount += 1;
    }
  }

  return {
    year,
    month,
    reminderCollected: centsToNumber(reminderCents),
    totalRevenue: centsToNumber(totalCents),
    blockedCount,
    blockedByReason: [...byReason.entries()].map(([reason, count]) => ({ reason, count })),
    sharingSignalCount,
  };
}

export type RecapTrendPoint = {
  year: number;
  month: number; // 0-indexed
  reminderCollected: number; // AZN
  blockedCount: number;
};

// Per-month series of the two attribution metrics, oldest first, ending on (year,month).
// Distinct from the dashboard's total-revenue chart — different series entirely.
export async function getRecapTrend(
  gymId: string,
  year: number,
  month: number,
  months = 6
): Promise<RecapTrendPoint[]> {
  const points: RecapTrendPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - i, 1));
    const r = await getMonthlyRecap(gymId, d.getUTCFullYear(), d.getUTCMonth());
    points.push({
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
      reminderCollected: r.reminderCollected,
      blockedCount: r.blockedCount,
    });
  }
  return points;
}
