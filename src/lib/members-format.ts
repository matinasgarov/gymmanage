// Display helpers for the members triage list. The text-producing helpers take
// a translator `t` (from getT()/useT()) so labels follow the active locale.

import type { TFunction } from "@/lib/i18n";

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const DAY_MS = 86_400_000;

export type SignalTone = "neutral" | "warn" | "danger";

// Expiry countdown. Muted by default; warns within a week, danger once expired.
export function expiryInfo(expiry: Date, t: TFunction): { days: number; label: string; tone: SignalTone } {
  const today = startOfDayUTC(new Date());
  const e = startOfDayUTC(expiry);
  const days = Math.round((e.getTime() - today.getTime()) / DAY_MS);
  if (days < 0) return { days, label: t("expiry.expired"), tone: "danger" };
  if (days === 0) return { days, label: t("expiry.today"), tone: "warn" };
  return { days, label: t("units.days", { count: days }), tone: days <= 7 ? "warn" : "neutral" };
}

// Relative last-check-in label, e.g. "Bu gün", "Dünən", "12 gün əvvəl".
export function lastSeenLabel(d: Date | null, t: TFunction): string {
  if (!d) return t("lastSeen.never");
  const today = startOfDayUTC(new Date());
  const day = startOfDayUTC(d);
  const diff = Math.round((today.getTime() - day.getTime()) / DAY_MS);
  if (diff <= 0) return t("lastSeen.today");
  if (diff === 1) return t("lastSeen.yesterday");
  return t("units.daysAgo", { count: diff });
}

export function shortDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Effective member status for display. The stored `status` field is never
// transitioned to EXPIRED, so a member whose membership lapsed keeps showing
// ACTIVE. Derive EXPIRED from `expiryDate` at display time. CANCELLED and FROZEN
// are explicit, owner-set states and win over expiry.
export function effectiveMemberStatus(m: { status: string; expiryDate: Date }): string {
  if (m.status === "CANCELLED" || m.status === "FROZEN") return m.status;
  const today = startOfDayUTC(new Date());
  if (startOfDayUTC(m.expiryDate).getTime() < today.getTime()) return "EXPIRED";
  return m.status;
}
