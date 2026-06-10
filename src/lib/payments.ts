import "server-only";
import { prisma } from "@/lib/prisma";
import type { PlanType } from "@/generated/prisma/enums";
import { planDurationDays } from "@/config/gym-plans";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

// Days after dueDate before a pending payment is considered overdue.
export const OVERDUE_GRACE_DAYS = 5;

const MONTHS: Record<Locale, string[]> = {
  az: [
    "Yanvar", "Fevral", "Mart", "Aprel", "May", "İyun",
    "İyul", "Avqust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr",
  ],
  ru: [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
  ],
};

export function periodKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatPeriodLabel(
  periodStart: Date,
  plan: PlanType,
  locale: Locale = DEFAULT_LOCALE
): string {
  const months = MONTHS[locale] ?? MONTHS[DEFAULT_LOCALE];
  const end = new Date(periodStart);
  end.setUTCDate(end.getUTCDate() + planDurationDays(plan) - 1);
  // Any 30-day plan (Monthly Unlimited, 12-entries) gets the "May 2026" label.
  if (planDurationDays(plan) === 30) {
    return `${months[periodStart.getUTCMonth()]} ${periodStart.getUTCFullYear()}`;
  }
  return `${periodStart.getUTCDate()} ${months[periodStart.getUTCMonth()]} – ${end.getUTCDate()} ${months[end.getUTCMonth()]} ${end.getUTCFullYear()}`;
}

// All period start dates from start to today (inclusive), for a plan.
export function periodsThrough(start: Date, plan: PlanType, now = new Date()): Date[] {
  const days = planDurationDays(plan);
  const out: Date[] = [];
  const cursor = new Date(Date.UTC(
    start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()
  ));
  const today = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()
  ));
  while (cursor.getTime() <= today.getTime()) {
    out.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + days);
  }
  return out;
}

// Idempotent: create pending payment rows for every elapsed period.
export async function ensurePendingPayments(memberId: string) {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: {
      id: true, gymId: true, startDate: true,
      planType: true, planPrice: true,
    },
  });
  if (!member) return;

  const periods = periodsThrough(member.startDate, member.planType);
  if (periods.length === 0) return;

  const existing = await prisma.payment.findMany({
    where: { memberId: member.id, period: { in: periods.map(periodKey) } },
    select: { period: true },
  });
  const have = new Set(existing.map((p: { period: string }) => p.period));
  const missing = periods.filter((d) => !have.has(periodKey(d)));
  if (missing.length === 0) return;

  await prisma.payment.createMany({
    data: missing.map((d) => ({
      memberId: member.id,
      gymId: member.gymId,
      amount: member.planPrice,
      period: periodKey(d),
      dueDate: d,
      status: "PENDING" as const,
    })),
    skipDuplicates: true,
  });
}

export function computeEffectiveStatus(
  payment: { status: string; dueDate: Date; paidAt: Date | null }
): "PAID" | "PENDING" | "OVERDUE" {
  if (payment.status === "PAID" || payment.paidAt) return "PAID";
  const cutoff = new Date(payment.dueDate);
  cutoff.setUTCDate(cutoff.getUTCDate() + OVERDUE_GRACE_DAYS);
  if (new Date().getTime() > cutoff.getTime()) return "OVERDUE";
  return "PENDING";
}

// Single source of truth for "what does this member owe right now".
// Consumed by the door (scan-actions), the pass page, /reminders, and the dashboard.
export type DebtSummary = {
  amount: number; // AZN — sum of all unpaid payments due so far
  periodLabel: string; // label of the most recent unpaid period
  graceDaysLeft: number; // 0 when effective is OVERDUE
  effective: "PENDING" | "OVERDUE";
};

export function computeDebt(
  payments: { status: string; dueDate: Date; paidAt: Date | null; amount: number }[],
  plan: PlanType,
  locale: Locale = DEFAULT_LOCALE,
  now = new Date()
): DebtSummary | null {
  const graceEnd = (dueDate: Date) => {
    const d = new Date(dueDate);
    d.setUTCDate(d.getUTCDate() + OVERDUE_GRACE_DAYS);
    return d;
  };
  const unpaid = payments.filter(
    (p) =>
      p.status !== "PAID" &&
      p.paidAt === null &&
      p.dueDate.getTime() <= now.getTime()
  );
  if (unpaid.length === 0) return null;

  const latest = unpaid.reduce((a, b) => (a.dueDate > b.dueDate ? a : b));
  const overdue = unpaid.some((p) => now.getTime() > graceEnd(p.dueDate).getTime());
  const graceDaysLeft = Math.max(
    0,
    Math.ceil((graceEnd(latest.dueDate).getTime() - now.getTime()) / 86_400_000)
  );
  return {
    amount: unpaid.reduce((s, p) => s + p.amount, 0),
    periodLabel: formatPeriodLabel(latest.dueDate, plan, locale),
    graceDaysLeft,
    effective: overdue ? "OVERDUE" : "PENDING",
  };
}
