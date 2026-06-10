"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { redeemPairing } from "@/lib/scanner-device-actions";
import { useT } from "@/components/i18n-provider";

export function RedeemPairingForm({ initialCode = "" }: { initialCode?: string }) {
  const t = useT();
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await redeemPairing(code.trim());
      if (result.ok) {
        router.replace("/door");
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm font-medium">{t("door.pairingCodeLabel")}</label>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={t("door.pairingCodePlaceholder")}
        className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-base"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending || code.trim().length === 0}
        className="btn-brand w-full"
      >
        {isPending ? t("door.connecting") : t("door.connect")}
      </button>
    </form>
  );
}
