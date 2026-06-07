import { describe, it, expect } from "vitest";
import { toCents, sumCents, centsToNumber, formatAZN, formatCentsAZN } from "@/lib/money";

describe("money", () => {
  describe("toCents", () => {
    it("converts numbers and decimal-like strings to integer cents", () => {
      expect(toCents(10.5)).toBe(1050);
      expect(toCents("10.50")).toBe(1050);
      expect(toCents({ toString: () => "12.34" })).toBe(1234);
    });

    it("rounds to the nearest cent and absorbs float drift", () => {
      // 0.1 + 0.2 = 0.30000000000000004 in float; must land on 30 cents.
      expect(toCents(0.1 + 0.2)).toBe(30);
      expect(toCents(1.999)).toBe(200);
      expect(toCents(1.994)).toBe(199);
      // NOTE: Math.round(n*100) inherits float representation — e.g. 1.005 is
      // stored as 1.00499…, so it rounds DOWN to 100, not 101. Documented, not a bug.
      expect(toCents(1.005)).toBe(100);
    });

    it("returns 0 for null/undefined/non-finite", () => {
      expect(toCents(null)).toBe(0);
      expect(toCents(undefined)).toBe(0);
      expect(toCents("not-a-number")).toBe(0);
    });
  });

  it("sumCents accumulates exactly in integer cents", () => {
    expect(sumCents([0.1, 0.2, 0.3])).toBe(60);
    expect(sumCents(["10.00", "5.50", "0.50"])).toBe(1600);
    expect(sumCents([])).toBe(0);
  });

  it("centsToNumber divides back to a decimal number", () => {
    expect(centsToNumber(1050)).toBe(10.5);
    expect(centsToNumber(0)).toBe(0);
  });

  describe("formatAZN", () => {
    it("formats with two decimals and the manat symbol", () => {
      expect(formatAZN(10.5)).toBe("10.50 ₼");
      expect(formatAZN("1000")).toBe("1000.00 ₼");
    });

    it("renders an em dash for missing/invalid values", () => {
      expect(formatAZN(null)).toBe("—");
      expect(formatAZN(undefined)).toBe("—");
      expect(formatAZN("abc")).toBe("—");
    });
  });

  it("formatCentsAZN formats integer cents", () => {
    expect(formatCentsAZN(1050)).toBe("10.50 ₼");
    expect(formatCentsAZN(0)).toBe("0.00 ₼");
  });
});
