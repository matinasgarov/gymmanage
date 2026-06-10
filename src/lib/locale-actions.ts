"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/session";
import { isLocale } from "@/lib/i18n";
import { LOCALE_COOKIE } from "@/lib/i18n-server";

const ONE_YEAR = 60 * 60 * 24 * 365;

// Set the active UI language: write the cookie (immediate effect) and persist it
// onto the logged-in user so the choice follows them across devices.
export async function setLocale(locale: string) {
  if (!isLocale(locale)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });

  const session = await readSession();
  if (session?.userId) {
    try {
      await prisma.user.update({ where: { id: session.userId }, data: { locale } });
    } catch {
      // Best-effort persistence; the cookie already took effect.
    }
  }
}
