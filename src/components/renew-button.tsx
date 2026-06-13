"use client";

import { useTransition } from "react";
import { renewMembership } from "@/lib/payment-actions";
import { useT, useLocale } from "@/components/i18n-provider";

// Renew control with an early-renewal guard: if the membership is still valid
// (now < expiry), confirm before recording another period so the owner doesn't
// accidentally double-charge a member who still has time left.
export function RenewButton({
  memberId,
  expiryDate,
}: {
  memberId: string;
  expiryDate: string; // ISO
}) {
  const t = useT();
  const locale = useLocale();
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const expiry = new Date(expiryDate);
    if (new Date() < expiry) {
      const ok = window.confirm(
        t("renew.confirm", { date: expiry.toLocaleDateString(locale) })
      );
      if (!ok) return;
    }
    start(async () => {
      await renewMembership(memberId, fd);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--d-tx3)" }}>{t("renew.prompt")}</span>
      <select name="method" defaultValue="CASH" className="md-select">
        <option value="CASH">{t("method.CASH")}</option>
        <option value="CARD">{t("method.CARD")}</option>
        <option value="TRANSFER">{t("method.TRANSFER")}</option>
      </select>
      <button type="submit" disabled={pending} className="md-btn-renew">
        {pending ? t("renew.renewing") : t("renew.submit")}
      </button>
    </form>
  );
}
