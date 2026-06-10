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
      <span className="text-xs text-[var(--muted)]">{t("renew.prompt")}</span>
      <select
        name="method"
        defaultValue="CASH"
        className="border border-[var(--border)] rounded-md px-2 py-1 text-sm bg-white"
      >
        <option value="CASH">{t("method.CASH")}</option>
        <option value="CARD">{t("method.CARD")}</option>
        <option value="TRANSFER">{t("method.TRANSFER")}</option>
      </select>
      <button type="submit" disabled={pending} className="btn-brand disabled:opacity-50">
        {pending ? t("renew.renewing") : t("renew.submit")}
      </button>
    </form>
  );
}
