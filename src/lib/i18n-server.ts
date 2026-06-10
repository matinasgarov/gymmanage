import "server-only";
import { cookies } from "next/headers";
import { createT, getDictionary, isLocale, DEFAULT_LOCALE, type Locale, type TFunction } from "@/lib/i18n";

export const LOCALE_COOKIE = "locale";

// Active locale for the current request. Cookie is the source of truth; it is
// seeded from the user's saved User.locale at login and updated by the switcher.
// Falls back to the default so unauthenticated/public pages still render.
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  return isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE;
}

// Server-side translator: `const t = await getT();` then `t("members.title")`.
export async function getT(): Promise<TFunction> {
  const locale = await getLocale();
  return createT(getDictionary(locale), locale);
}
