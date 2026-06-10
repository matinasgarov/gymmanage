"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LOCALES, type Locale } from "@/lib/i18n";
import { useLocale } from "@/components/i18n-provider";
import { setLocale } from "@/lib/locale-actions";

const LABEL: Record<Locale, string> = { az: "AZ", ru: "RU" };

export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const active = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();

  function choose(locale: Locale) {
    if (locale === active) return;
    start(async () => {
      await setLocale(locale);
      router.refresh();
    });
  }

  return (
    <div className={`inline-flex items-center rounded-full border border-[var(--border)] p-0.5 text-xs ${className}`}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => choose(l)}
          disabled={pending}
          aria-pressed={l === active}
          className={`px-2 py-0.5 rounded-full font-medium transition-colors disabled:opacity-50 ${
            l === active
              ? "bg-[var(--brand)] text-white"
              : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          {LABEL[l]}
        </button>
      ))}
    </div>
  );
}
