import { describe, it, expect, vi } from "vitest";
import type { PlanType } from "@/generated/prisma/enums";

// payments.ts imports the Prisma singleton for ensurePendingPayments; the pure
// functions under test do not touch it, so stub it out to avoid a real client.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import {
  periodKey,
  formatPeriodLabel,
  periodsThrough,
  computeEffectiveStatus,
  computeDebt,
  OVERDUE_GRACE_DAYS,
} from "@/lib/payments";

const MONTHLY = "MONTHLY_UNLIMITED" as PlanType;
const QUARTERLY = "THREE_MONTHS" as PlanType;

describe("payments — period key format", () => {
  it("is YYYY-MM-DD (a full date), NOT YYYY-MM", () => {
    const key = periodKey(new Date("2026-05-04T10:30:00Z"));
    expect(key).toBe("2026-05-04");
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Guard against a regression toward the (incorrectly specced) "YYYY-MM".
    expect(key).not.toMatch(/^\d{4}-\d{2}$/);
  });
});

describe("payments — computeEffectiveStatus", () => {
  it("is PAID when status is PAID or paidAt is set", () => {
    expect(
      computeEffectiveStatus({ status: "PAID", dueDate: new Date(), paidAt: null })
    ).toBe("PAID");
    expect(
      computeEffectiveStatus({
        status: "PENDING",
        dueDate: new Date(),
        paidAt: new Date(),
      })
    ).toBe("PAID");
  });

  it("is PENDING when unpaid but still within the 5-day grace", () => {
    const dueDate = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000); // 4 days ago
    expect(computeEffectiveStatus({ status: "PENDING", dueDate, paidAt: null })).toBe(
      "PENDING"
    );
  });

  it("is OVERDUE once unpaid past the 5-day grace", () => {
    const dueDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    expect(computeEffectiveStatus({ status: "PENDING", dueDate, paidAt: null })).toBe(
      "OVERDUE"
    );
  });
});

describe("payments — formatPeriodLabel", () => {
  it("labels a monthly period as 'Month Year' in Azerbaijani", () => {
    expect(formatPeriodLabel(new Date("2026-05-01T00:00:00Z"), MONTHLY)).toBe("May 2026");
    expect(formatPeriodLabel(new Date("2026-01-01T00:00:00Z"), MONTHLY)).toBe(
      "Yanvar 2026"
    );
  });

  it("labels a quarterly period as a date range", () => {
    const label = formatPeriodLabel(new Date("2026-01-01T00:00:00Z"), QUARTERLY);
    expect(label).toContain("Yanvar");
    expect(label).toContain("2026");
    expect(label).toContain("–");
  });
});

describe("payments — periodsThrough", () => {
  it("yields one period start per elapsed plan cycle up to now", () => {
    const periods = periodsThrough(
      new Date("2026-01-01T00:00:00Z"),
      MONTHLY,
      new Date("2026-03-15T00:00:00Z")
    );
    // 2026-01-01, +30 → 2026-01-31, +30 → 2026-03-02 (next would be 2026-04-01 > now)
    expect(periods).toHaveLength(3);
    expect(periodKey(periods[0])).toBe("2026-01-01");
    expect(periodKey(periods[periods.length - 1])).toBe("2026-03-02");
  });

  it("returns a single period when the next cycle has not elapsed", () => {
    const periods = periodsThrough(
      new Date("2026-06-01T00:00:00Z"),
      MONTHLY,
      new Date("2026-06-10T00:00:00Z")
    );
    expect(periods).toHaveLength(1);
  });
});

describe("payments — computeDebt", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = new Date("2026-05-10T12:00:00Z");
  const pay = (daysAgo: number, amount = 50, paid = false) => ({
    status: paid ? "PAID" : "PENDING",
    dueDate: new Date(now.getTime() - daysAgo * day),
    paidAt: paid ? new Date(now.getTime() - daysAgo * day) : null,
    amount,
  });

  it("exports the 5-day grace constant", () => {
    expect(OVERDUE_GRACE_DAYS).toBe(5);
  });

  it("returns null when nothing is unpaid", () => {
    expect(computeDebt([], MONTHLY, "az", now)).toBeNull();
    expect(computeDebt([pay(2, 50, true)], MONTHLY, "az", now)).toBeNull();
  });

  it("is PENDING with grace days left within the 5-day window", () => {
    const d = computeDebt([pay(2)], MONTHLY, "az", now);
    expect(d?.effective).toBe("PENDING");
    expect(d?.graceDaysLeft).toBe(3);
    expect(d?.amount).toBe(50);
    expect(d?.periodLabel).toContain("2026");
  });

  it("is OVERDUE with zero grace once past the window", () => {
    const d = computeDebt([pay(6)], MONTHLY, "az", now);
    expect(d?.effective).toBe("OVERDUE");
    expect(d?.graceDaysLeft).toBe(0);
  });

  it("boundary: day 5 is still PENDING, day 6 is OVERDUE", () => {
    expect(computeDebt([pay(5)], MONTHLY, "az", now)?.effective).toBe("PENDING");
    expect(computeDebt([pay(6)], MONTHLY, "az", now)?.effective).toBe("OVERDUE");
  });

  it("sums multiple unpaid periods; any overdue period makes the whole debt OVERDUE", () => {
    const d = computeDebt([pay(40), pay(2)], MONTHLY, "az", now);
    expect(d?.amount).toBe(100);
    expect(d?.effective).toBe("OVERDUE");
  });

  it("zeroes graceDaysLeft when an older period is overdue even if the latest is in grace", () => {
    const d = computeDebt([pay(40), pay(2)], MONTHLY, "az", now);
    expect(d?.effective).toBe("OVERDUE");
    expect(d?.graceDaysLeft).toBe(0);
  });

  it("ignores future-dated payments", () => {
    const future = {
      status: "PENDING",
      dueDate: new Date(now.getTime() + 5 * day),
      paidAt: null,
      amount: 50,
    };
    expect(computeDebt([future], MONTHLY, "az", now)).toBeNull();
  });
});
