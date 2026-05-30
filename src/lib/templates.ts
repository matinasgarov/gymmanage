// WhatsApp message templates with simple {placeholder} substitution.
// Each gym can override these on the Settings page.

export type TemplateKey =
  | "reminder"
  | "receipt"
  | "expiring"
  | "welcome";

export const DEFAULT_TEMPLATES: Record<TemplateKey, string> = {
  reminder:
    "Salam {memberName}! {gymName} üzvlüyünüzün {period} dövrü üçün ödəniş ({amount}) hələ qeydə alınmayıb. Zəhmət olmasa ödənişinizi təsdiqləyin.",
  receipt:
    "Salam {memberName}! {period} dövrü üçün {amount} ödənişiniz qeydə alındı. Üzvlüyünüz {expiryDate} tarixinə qədər aktivdir. QR keçidiniz: {passUrl}",
  expiring:
    "Salam {memberName}! {gymName} üzvlüyünüz {daysLeft} gün sonra başa çatır ({expiryDate}). Yeniləmək üçün adminlə əlaqə saxlayın.",
  welcome:
    "Salam {memberName}! {gymName}-a xoş gəlmisiniz. Üzv kartınız: {passUrl}",
};

export const TEMPLATE_LABELS: Record<TemplateKey, string> = {
  reminder: "Borc xatırlatması",
  receipt: "Ödəniş təsdiqi",
  expiring: "Üzvlük bitir",
  welcome: "Yeni üzv salamlaması",
};

export const TEMPLATE_PLACEHOLDERS: Record<TemplateKey, string[]> = {
  reminder: ["{memberName}", "{gymName}", "{period}", "{amount}"],
  receipt: ["{memberName}", "{period}", "{amount}", "{expiryDate}", "{passUrl}"],
  expiring: ["{memberName}", "{gymName}", "{daysLeft}", "{expiryDate}"],
  welcome: ["{memberName}", "{gymName}", "{passUrl}"],
};

export function renderTemplate(
  template: string,
  values: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (_match, key) => {
    const v = values[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

export function pickTemplate(
  key: TemplateKey,
  gymOverride: string | null | undefined
): string {
  return gymOverride && gymOverride.trim().length > 0
    ? gymOverride
    : DEFAULT_TEMPLATES[key];
}

export function buildWaUrl(phone: string, message: string): string {
  const stripped = phone.replace(/^\+/, "");
  return `https://wa.me/${stripped}?text=${encodeURIComponent(message)}`;
}
