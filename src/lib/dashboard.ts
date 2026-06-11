import "server-only";
import { forGym } from "@/lib/tenant";
import { PLAN_LABEL } from "@/lib/labels";
import { toCents, centsToNumber } from "@/lib/money";
import { getAtRiskCounts } from "@/lib/retention";
import { OVERDUE_GRACE_DAYS } from "@/lib/payments";

const AZ_MONTHS_SHORT = [
  "Yan", "Fev", "Mar", "Apr", "May", "İyn",
  "İyl", "Avq", "Sen", "Okt", "Noy", "Dek",
];

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
  // Fetch a full year of buckets; the chart slices to the selected range (3/6/12).
  const twelveMonthsAgo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));

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
        paidAt: { gte: twelveMonthsAgo },
      },
      select: { amount: true, paidAt: true },
    }),

    // Revenue by plan — current month
    db.payment.findMany({
      where: {
        status: "PAID",
        paidAt: { gte: monthStart },
      },
      select: { amount: true, memberPlanType: true, member: { select: { planType: true } } },
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

  // Visitor passes over the last year (walk-ins + day-passes) — used both for the
  // current-month headline and to fold walk-in revenue into the monthly chart.
  const visitorPasses = await db.visitorPass.findMany({
    where: { createdAt: { gte: twelveMonthsAgo } },
    select: { amount: true, createdAt: true },
  });
  let visitorRevenueCents = 0;
  for (const v of visitorPasses) {
    if (v.createdAt >= monthStart) visitorRevenueCents += toCents(v.amount);
  }

  // Money the owner should collect right now: every unpaid payment already due
  // (both within-grace and overdue) for non-cancelled/frozen members.
  const collectRows = await db.payment.findMany({
    where: {
      status: { not: "PAID" },
      paidAt: null,
      dueDate: { lte: now },
      member: { status: { notIn: ["CANCELLED", "FROZEN"] } },
    },
    select: { amount: true, memberId: true },
  });
  let collectCents = 0;
  const collectMemberIds = new Set<string>();
  for (const r of collectRows) {
    collectCents += toCents(r.amount);
    if (r.memberId) collectMemberIds.add(r.memberId);
  }

  const [newLeadsCount, atRisk, gymRow] = await Promise.all([
    db.lead.count({ where: { status: "NEW" } }),
    getAtRiskCounts(gymId),
    db.gym.findUnique({ where: { id: gymId }, select: { monthlyRevenueGoal: true } }),
  ]);
  const monthlyGoal =
    gymRow?.monthlyRevenueGoal != null
      ? centsToNumber(toCents(gymRow.monthlyRevenueGoal))
      : null;

  // Aggregate revenue by plan + visitor pseudo-plan, exact integer cents.
  const planCents: Record<string, number> = {};
  for (const p of monthRevenueByPlan) {
    const plan = p.member?.planType ?? p.memberPlanType ?? "MONTHLY_UNLIMITED";
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

  // Build 12-month buckets (cents) — member payments + visitor passes.
  const buckets: { label: string; cents: number; year: number; month: number }[] = [];
  for (let i = 11; i >= 0; i--) {
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
    const paidAt = p.paidAt;
    const b = buckets.find(
      (x) => x.year === paidAt.getUTCFullYear() && x.month === paidAt.getUTCMonth()
    );
    if (b) b.cents += toCents(p.amount);
  }
  for (const v of visitorPasses) {
    const b = buckets.find(
      (x) => x.year === v.createdAt.getUTCFullYear() && x.month === v.createdAt.getUTCMonth()
    );
    if (b) b.cents += toCents(v.amount);
  }

  const monthRevenueCents = toCents(monthRevenueRow._sum.amount) + visitorRevenueCents;

  // The query already excludes orphaned (deleted-member) rows via the member
  // status filter; narrow the type so consumers see a non-null member.
  const overdueWithMember = overdueMembers.filter(
    (p): p is typeof p & { member: NonNullable<(typeof p)["member"]> } => p.member !== null
  );

  return {
    activeCount,
    overdueCount: overdueWithMember.length,
    overdueMembers: overdueWithMember,
    expiringCount: expiringMembers.length,
    expiringMembers,
    todayCheckIns,
    monthRevenue: centsToNumber(monthRevenueCents),
    monthlyGoal,
    revenueByMonth: buckets.map((b) => ({ label: b.label, total: centsToNumber(b.cents) })),
    revenueByPlan,
    churnRate,
    cancelledThisMonth,
    activeAtMonthStart,
    newLeadsCount,
    atRisk,
    collect: {
      amount: centsToNumber(collectCents),
      people: collectMemberIds.size,
    },
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
