import "server-only";

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "gym.create": "Zal yaradıldı",
  "member.create": "Üzv əlavə edildi",
  "member.update": "Üzv yeniləndi",
  "member.freeze": "Üzvlük donduruldu",
  "member.cancel": "Üzvlük ləğv edildi",
  "member.reactivate": "Üzvlük aktivləşdirildi",
  "member.delete": "Üzv silindi",
  "payment.mark_paid": "Ödəniş qeydə alındı",
  "payment.unmark": "Ödəniş geri alındı",
  "checkin.override": "Giriş icazəsi (override)",
  "reminder.sent": "WhatsApp xatırlatması göndərildi",
  "reminder.skip": "Xatırlatma atlandı",
};

export type AuditPayload = Record<string, unknown> | null;

export function summarizeAudit(payload: AuditPayload): string {
  if (!payload || typeof payload !== "object") return "";
  const parts: string[] = [];
  if ("period" in payload && payload.period) parts.push(`Dövr: ${String(payload.period)}`);
  if ("amount" in payload && payload.amount) parts.push(`Məbləğ: ${String(payload.amount)}`);
  if ("method" in payload && payload.method) parts.push(`Üsul: ${String(payload.method)}`);
  if ("reason" in payload && payload.reason) parts.push(`Səbəb: ${String(payload.reason)}`);
  return parts.join(" · ");
}

export function entityHref(entityType: string, entityId: string, payload: AuditPayload): string | null {
  if (entityType === "Member") return `/members/${entityId}`;
  if (entityType === "Payment" && payload && typeof payload === "object" && "memberId" in payload) {
    return `/members/${String(payload.memberId)}`;
  }
  if (entityType === "CheckIn" && payload && typeof payload === "object" && "memberId" in payload) {
    return `/members/${String(payload.memberId)}`;
  }
  return null;
}
