// Centralized membership-plan configuration — the single place to edit plan
// durations, entry caps, display labels and default pricing.
//
// Per-gym price *overrides* still live in the PlanPrice DB table (so a gym can
// change its prices without mutating existing members). `defaultPrice` here is
// only the form's starting value when no override exists.
//
// This module is dependency-free (no server-only imports) so it can be consumed
// from both server actions and client components.

import type { PlanType } from "@/generated/prisma/enums";

export type PlanConfig = {
  /** Azerbaijani label shown in every dropdown / badge. */
  label: string;
  /** Membership length in days; drives expiry and billing-period math. */
  durationDays: number;
  /** Cap on GRANTED entries per billing cycle. null = unlimited. */
  maxEntries: number | null;
  /** Starting price in the new-member form when the gym has no PlanPrice row. */
  defaultPrice: number;
  /** Display order in dropdowns. */
  order: number;
};

export const PLANS: Record<PlanType, PlanConfig> = {
  TWELVE_ENTRIES: { label: "12 giriş", durationDays: 30, maxEntries: 12, defaultPrice: 40, order: 1 },
  MONTHLY_UNLIMITED: { label: "Aylıq", durationDays: 30, maxEntries: null, defaultPrice: 50, order: 2 },
  THREE_MONTHS: { label: "3 Aylıq", durationDays: 90, maxEntries: null, defaultPrice: 135, order: 3 },
  YEARLY: { label: "İllik", durationDays: 365, maxEntries: null, defaultPrice: 480, order: 4 },
};

// Ordered list of plan values — map over this in UI instead of hardcoding.
export const PLAN_TYPES = (Object.keys(PLANS) as PlanType[]).sort(
  (a, b) => PLANS[a].order - PLANS[b].order
);

// Plain { value: label } map for label lookups (e.g. badges, list filters).
// Typed loosely (string key) so callers can index with an unverified planType
// string and fall back to the raw value.
export const PLAN_LABEL: Record<string, string> = Object.fromEntries(
  PLAN_TYPES.map((p) => [p, PLANS[p].label])
);

export function planDurationDays(plan: PlanType): number {
  return PLANS[plan].durationDays;
}

export function planMaxEntries(plan: PlanType): number | null {
  return PLANS[plan].maxEntries;
}

export function planLabel(plan: PlanType): string {
  return PLANS[plan]?.label ?? plan;
}

// Type guard for untrusted form input.
export function isPlanType(v: unknown): v is PlanType {
  return typeof v === "string" && v in PLANS;
}
