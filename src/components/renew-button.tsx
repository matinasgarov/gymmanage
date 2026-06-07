"use client";

import { useTransition } from "react";
import { renewMembership } from "@/lib/payment-actions";

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
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const expiry = new Date(expiryDate);
    if (new Date() < expiry) {
      const left = expiry.toLocaleDateString("az");
      const ok = window.confirm(
        `Üzvlüyün hələ ${left} tarixinə qədər keçərlidir. Yenə də yeniləmək istəyirsiniz?`
      );
      if (!ok) return;
    }
    start(async () => {
      await renewMembership(memberId, fd);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex items-center gap-2">
      <span className="text-xs text-[var(--muted)]">Üzvlüyü yenilə:</span>
      <select
        name="method"
        defaultValue="CASH"
        className="border border-[var(--border)] rounded-md px-2 py-1 text-sm bg-white"
      >
        <option value="CASH">Nağd</option>
        <option value="CARD">Kart</option>
        <option value="TRANSFER">Köçürmə</option>
      </select>
      <button type="submit" disabled={pending} className="btn-brand disabled:opacity-50">
        {pending ? "Yenilənir…" : "Yenilə"}
      </button>
    </form>
  );
}
