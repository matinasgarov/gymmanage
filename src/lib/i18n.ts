// Pure i18n core — no next/* or server-only imports, so it can be used from
// both Server Components and Client Components. Locale resolution that needs
// cookies/DB lives in i18n-server.ts; the client hook lives in i18n-provider.tsx.

import az from "@/locales/az.json";
import ru from "@/locales/ru.json";

export const LOCALES = ["az", "ru"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "az";

// az.json is the source-of-truth shape; ru.json mirrors it.
export type Dict = typeof az;
const DICTS: Record<Locale, Dict> = { az, ru: ru as Dict };

export function isLocale(v: unknown): v is Locale {
  return typeof v === "string" && (LOCALES as readonly string[]).includes(v);
}

export function getDictionary(locale: Locale): Dict {
  return DICTS[locale] ?? DICTS[DEFAULT_LOCALE];
}

export type TParams = Record<string, string | number>;

type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>>;

function isPluralForms(v: unknown): v is PluralForms {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in params ? String(params[k]) : `{${k}}`
  );
}

// Resolve a dot-path key against a dictionary, with {param} interpolation and
// plural selection (when `count` is provided and the value is a forms object).
export function translate(
  dict: Dict,
  locale: Locale,
  key: string,
  params?: TParams
): string {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return key; // missing — surface the key rather than crash
    }
  }

  if (typeof node === "string") return interpolate(node, params);

  // Plural form object: pick by count.
  if (isPluralForms(node) && params && typeof params.count === "number") {
    const rule = new Intl.PluralRules(locale).select(params.count);
    const chosen = node[rule] ?? node.other ?? node.one;
    return interpolate(chosen ?? key, params);
  }

  return key;
}

export type TFunction = (key: string, params?: TParams) => string;

export function createT(dict: Dict, locale: Locale): TFunction {
  return (key, params) => translate(dict, locale, key, params);
}
