import { describe, it, expect } from "vitest";
import { createT, getDictionary, translate, LOCALES, type Dict } from "@/lib/i18n";
import az from "@/locales/az.json";
import ru from "@/locales/ru.json";

const tAz = createT(getDictionary("az"), "az");
const tRu = createT(getDictionary("ru"), "ru");

describe("i18n — key resolution", () => {
  it("resolves nested dot-path keys", () => {
    expect(tAz("status.ACTIVE")).toBe("Aktiv");
    expect(tRu("status.ACTIVE")).toBe("Активен");
  });

  it("returns the key itself when missing (no crash)", () => {
    expect(tAz("nope.missing.key")).toBe("nope.missing.key");
  });

  it("interpolates {params}", () => {
    expect(translate(getDictionary("az"), "az", "units.days", { count: 7 })).toBe("7 gün");
  });
});

describe("i18n — Russian plural rules", () => {
  // RU: 1 день / 2 дня / 5 дней (one / few / many)
  it("selects the correct plural form by count", () => {
    expect(tRu("units.days", { count: 1 })).toBe("1 день");
    expect(tRu("units.days", { count: 2 })).toBe("2 дня");
    expect(tRu("units.days", { count: 5 })).toBe("5 дней");
    expect(tRu("units.days", { count: 21 })).toBe("21 день");
    expect(tRu("units.days", { count: 11 })).toBe("11 дней"); // teens are "many"
  });

  it("Azerbaijani has a single form for any count", () => {
    expect(tAz("units.days", { count: 1 })).toBe("1 gün");
    expect(tAz("units.days", { count: 5 })).toBe("5 gün");
  });
});

describe("i18n — dictionary parity", () => {
  // Plural-form objects legitimately differ per locale (az: one/other; ru adds
  // few/many), so treat them as leaves rather than recursing into their forms.
  const PLURAL_KEYS = new Set(["zero", "one", "two", "few", "many", "other"]);
  const isPluralObj = (o: Record<string, unknown>) =>
    Object.keys(o).length > 0 && Object.keys(o).every((k) => PLURAL_KEYS.has(k));

  // Collect every leaf path (plain objects recurse; arrays/strings/plural-form
  // objects are leaves).
  function paths(obj: unknown, prefix = ""): string[] {
    if (obj && typeof obj === "object" && !Array.isArray(obj) && !isPluralObj(obj as Record<string, unknown>)) {
      return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
        paths(v, prefix ? `${prefix}.${k}` : k)
      );
    }
    return [prefix];
  }

  it("ru.json has exactly the same keys as az.json", () => {
    const azPaths = new Set(paths(az));
    const ruPaths = new Set(paths(ru as Dict));
    const missingInRu = [...azPaths].filter((p) => !ruPaths.has(p));
    const extraInRu = [...ruPaths].filter((p) => !azPaths.has(p));
    expect({ missingInRu, extraInRu }).toEqual({ missingInRu: [], extraInRu: [] });
  });

  it("covers every supported locale", () => {
    for (const l of LOCALES) expect(getDictionary(l)).toBeTruthy();
  });
});
