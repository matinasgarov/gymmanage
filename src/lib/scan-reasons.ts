// Single source of truth for scanner denial-reason strings. These are written to
// CheckIn.deniedReason and also matched by the monthly recap, so both must read the
// same constants. (Strings are Azerbaijani; deniedReason is stored AZ-only by design.)
export const REASON: Record<string, string> = {
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

// Denials that represent protected revenue: someone who owed money or had no valid
// membership was kept out. FROZEN (a deliberate pause) and limit_reached (cap
// enforcement) are NOT revenue loss; already_entered is a separate sharing signal.
export const REVENUE_DENIAL_REASONS: readonly string[] = [
  REASON.PAYMENT,
  REASON.EXPIRED,
  REASON.CANCELLED,
];

// Reverse map: stored AZ string -> stable code, so UIs can localize the breakdown
// instead of printing the raw AZ string.
export const REASON_CODE: Record<string, string> = {
  [REASON.PAYMENT]: "payment",
  [REASON.EXPIRED]: "expired",
  [REASON.CANCELLED]: "cancelled",
  [REASON.already_entered]: "alreadyEntered",
};
