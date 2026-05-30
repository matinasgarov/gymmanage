import "server-only";
import { forGym } from "@/lib/tenant";
import { PLAN_LABEL } from "@/lib/labels";
import { toCents, centsToNumber } from "@/lib/money";

const AZ_MONTHS_SHORT = [
  "Yan", "Fev", "Mar", "Apr", "May", "İyn",
  "İyl", "Avq", "Sen", "Okt", "Noy", "Dek",
];

const OVERDUE_GRACE_DAYS = 5;

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;

export async function getDashboard(gymId: string) {
  const db = forGym(gymId);
  const now = new Date();
  const todayStart = startOfDayUTC(now);
  const tomorrowStart = addDays(todayStart, 1);
  const weekAhead = addDays(todayStart, 7);
  const overdueCutoff = addDays(todayStart, -OVERDUE_GRACE_DAYS);

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const sixMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));

  const [
    activeCount,
    overdueMembers,
    expiringMembers,
    todayCheckIns,
    monthRevenueRow,
    revenuePayments,
    monthRevenueByPlan,
    cancelledThisMonth,
    activeAtMonthStart,
  ] = await Promise.all([
    db.member.count({ where: { status: "ACTIVE" } }),

    db.payment.findMany({
      where: {
        status: { not: "PAID" },
        dueDate: { lte: overdueCutoff },
        member: { status: { notIn: ["CANCELLED", "FROZEN"] } },
      },
      include: {
        member: {
          select: { id: true, name: true, publicId: true, phone: true },
        },
      },
      orderBy: { dueDate: "asc" },
      take: 50,
    }),

    db.member.findMany({
      where: {
        status: "ACTIVE",
        expiryDate: { gte: todayStart, lte: weekAhead },
      },
      orderBy: { expiryDate: "asc" },
      select: {
        id: true,
        name: true,
        publicId: true,
        phone: true,
        expiryDate: true,
      },
      take: 50,
    }),

    db.checkIn.count({
      where: {
        result: "GRANTED",
        scannedAt: { gte: todayStart, lt: tomorrowStart },
      },
    }),

    db.payment.aggregate({
      where: {
        status: "PAID",
        paidAt: { gte: monthStart },
      },
      _sum: { amount: true },
    }),

    db.payment.findMany({
      where: {
        status: "PAID",
        paidAt: { gte: sixMonthsAgo },
      },
      select: { amount: true, paidAt: true },
    }),

    // Revenue by plan — current month
    db.payment.findMany({
      where: {
        status: "PAID",
        paidAt: { gte: monthStart },
      },
      select: { amount: true, member: { select: { planType: true } } },
    }),

    // Members cancelled this calendar month
    db.member.count({
      where: {
        status: "CANCELLED",
        cancelledAt: { gte: monthStart },
      },
    }),

    // Members who were active at the start of this month: created before monthStart
    // and not cancelled before monthStart.
    db.member.count({
      where: {
        createdAt: { lt: monthStart },
        OR: [
          { cancelledAt: null },
          { cancelledAt: { gte: monthStart } },
        ],
      },
    }),
  ]);

  // Visitor revenue this month (walk-ins + day-passes)
  const visitorRevenueRow = await db.visitorPass.aggregate({
    where: { createdAt: { gte: monthStart } },
    _sum: { amount: true },
  });
  const visitorRevenueCents = toCents(visitorRevenueRow._sum.amount);

  const newLeadsCount = await db.lead.count({
    where: { status: "NEW" },
  });

  // Aggregate revenue by plan + visitor pseudo-plan, exact integer cents.
  const planCents: Record<string, number> = { MONTHLY: 0, QUARTERLY: 0, ANNUAL: 0 };
  for (const p of monthRevenueByPlan) {
    const plan = p.member?.planType ?? "MONTHLY";
    planCents[plan] = (planCents[plan] ?? 0) + toCents(p.amount);
  }
  const revenueByPlan = Object.entries(planCents)
    .filter(([, c]) => c > 0)
    .map(([plan, c]) => ({ plan, label: PLAN_LABEL[plan] ?? plan, total: centsToNumber(c) }));
  if (visitorRevenueCents > 0) {
    revenueByPlan.push({ plan: "VISITOR", label: "Qonaqlar", total: centsToNumber(visitorRevenueCents) });
  }

  // Churn rate: cancelled this month / active at start of month
  const churnRate = activeAtMonthStart > 0
    ? (cancelledThisMonth / activeAtMonthStart) * 100
    : 0;

  // Build 6-month bucket (cents)
  const buckets: { label: string; cents: number; year: number; month: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.push({
      label: AZ_MONTHS_SHORT[d.getUTCMonth()],
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
      cents: 0,
    });
  }
  for (const p of revenuePayments) {
    if (!p.paidAt) continue;
    const y = p.paidAt.getUTCFullYear();
    const m = p.paidAt.getUTCMonth();
    const b = buckets.find((x) => x.year === y && x.month === m);
    if (b) b.cents += toCents(p.amount);
  }

  const monthRevenueCents = toCents(monthRevenueRow._sum.amount) + visitorRevenueCents;

  return {
    activeCount,
    overdueCount: overdueMembers.length,
    overdueMembers,
    expiringCount: expiringMembers.length,
    expiringMembers,
    todayCheckIns,
    monthRevenue: centsToNumber(monthRevenueCents),
    revenueByMonth: buckets.map((b) => ({ label: b.label, total: centsToNumber(b.cents) })),
    revenueByPlan,
    churnRate,
    cancelledThisMonth,
    activeAtMonthStart,
    newLeadsCount,
  };
}

import { buildWaUrl, pickTemplate, renderTemplate } from "@/lib/templates";

export function waReminderUrl(
  gym: { name: string; waReminderTemplate: string | null },
  member: { name: string; phone: string },
  period: string,
  amount: string
): string {
  const template = pickTemplate("reminder", gym.waReminderTemplate);
  const msg = renderTemplate(template, {
    memberName: member.name,
    gymName: gym.name,
    period,
    amount,
  });
  return buildWaUrl(member.phone, msg);
}
