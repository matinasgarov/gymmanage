"use client";

import { createContext, useContext, useMemo } from "react";
import { createT, type Dict, type Locale, type TFunction } from "@/lib/i18n";

type I18nValue = { locale: Locale; t: TFunction };

const I18nContext = createContext<I18nValue | null>(null);

// Receives the server-resolved dictionary + locale (from the root layout) and
// exposes them to client components via useT()/useLocale().
export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dict;
  children: React.ReactNode;
}) {
  const value = useMemo<I18nValue>(() => ({ locale, t: createT(dict, locale) }), [locale, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT/useLocale must be used within <I18nProvider>");
  return ctx;
}

export function useT(): TFunction {
  return useI18n().t;
}

export function useLocale(): Locale {
  return useI18n().locale;
}
