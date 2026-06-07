// Single source of truth for Azerbaijani enum labels + their badge colors.
// Previously these were copy-pasted across dashboard, members, payments,
// member detail and visitors pages.

export const MEMBER_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Aktiv",
  OVERDUE: "Borclu",
  FROZEN: "Donduruldu",
  EXPIRED: "Bitib",
  CANCELLED: "Ləğv edilib",
};

export const MEMBER_STATUS_COLOR: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  OVERDUE: "bg-orange-100 text-orange-700",
  FROZEN: "bg-sky-100 text-sky-700",
  EXPIRED: "bg-slate-200 text-slate-700",
  CANCELLED: "bg-red-100 text-red-700",
};

// Plan labels live in the centralized plan config — re-exported here so the
// existing `@/lib/labels` import sites keep working with one source of truth.
export { PLAN_LABEL } from "@/config/gym-plans";

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PAID: "Ödənildi",
  PENDING: "Gözlənilir",
  OVERDUE: "Vaxtı keçib",
};

export const PAYMENT_STATUS_COLOR: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-700",
  PENDING: "bg-amber-100 text-amber-700",
  OVERDUE: "bg-red-100 text-red-700",
};

export const PAY_METHOD_LABEL: Record<string, string> = {
  CASH: "Nağd",
  CARD: "Kart",
  TRANSFER: "Köçürmə",
};

export const CANCEL_REASON_LABEL: Record<string, string> = {
  MOVED: "Köçüb",
  PRICE: "Qiymət",
  INJURY: "Zədə",
  LOST_MOTIVATION: "Motivasiya itkisi",
  POOR_SERVICE: "Xidmətdən narazılıq",
  OTHER: "Digər",
};
