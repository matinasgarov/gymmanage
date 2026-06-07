import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  effectiveMemberStatus,
  expiryInfo,
  lastSeenLabel,
  shortDate,
} from "@/lib/members-format";

const DAY = 24 * 60 * 60 * 1000;

// Pin "now" so day-relative assertions are deterministic. Only Date is faked
// (timers/promises stay real for async mocks elsewhere).
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-07T09:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

describe("effectiveMemberStatus — derives EXPIRED from expiryDate", () => {
  it("keeps ACTIVE while expiry is in the future or today", () => {
    expect(
      effectiveMemberStatus({ status: "ACTIVE", expiryDate: new Date(Date.now() + 5 * DAY) })
    ).toBe("ACTIVE");
    expect(
      effectiveMemberStatus({ status: "ACTIVE", expiryDate: new Date() })
    ).toBe("ACTIVE");
  });

  it("returns EXPIRED once expiry has passed (stored status never flips)", () => {
    expect(
      effectiveMemberStatus({ status: "ACTIVE", expiryDate: new Date(Date.now() - 5 * DAY) })
    ).toBe("EXPIRED");
    expect(
      effectiveMemberStatus({ status: "OVERDUE", expiryDate: new Date(Date.now() - 1 * DAY) })
    ).toBe("EXPIRED");
  });

  it("lets explicit FROZEN/CANCELLED win over expiry", () => {
    expect(
      effectiveMemberStatus({ status: "FROZEN", expiryDate: new Date(Date.now() - 5 * DAY) })
    ).toBe("FROZEN");
    expect(
      effectiveMemberStatus({ status: "CANCELLED", expiryDate: new Date(Date.now() - 5 * DAY) })
    ).toBe("CANCELLED");
  });
});

describe("expiryInfo — countdown + muted-palette tone", () => {
  it("is danger + 'Bitib' once expired", () => {
    expect(expiryInfo(new Date(Date.now() - 2 * DAY))).toMatchObject({
      tone: "danger",
      label: "Bitib",
    });
  });

  it("warns on the day of and within a week", () => {
    expect(expiryInfo(new Date())).toMatchObject({ tone: "warn", label: "Bu gün", days: 0 });
    expect(expiryInfo(new Date(Date.now() + 3 * DAY))).toMatchObject({
      tone: "warn",
      label: "3 gün",
      days: 3,
    });
  });

  it("is neutral when more than a week out", () => {
    expect(expiryInfo(new Date(Date.now() + 20 * DAY))).toMatchObject({
      tone: "neutral",
      label: "20 gün",
      days: 20,
    });
  });
});

describe("lastSeenLabel — relative last check-in", () => {
  it("handles never / today / yesterday / N days ago", () => {
    expect(lastSeenLabel(null)).toBe("Heç vaxt");
    expect(lastSeenLabel(new Date())).toBe("Bu gün");
    expect(lastSeenLabel(new Date(Date.now() - 1 * DAY))).toBe("Dünən");
    expect(lastSeenLabel(new Date(Date.now() - 5 * DAY))).toBe("5 gün əvvəl");
  });
});

describe("shortDate", () => {
  it("renders an ISO yyyy-mm-dd slice", () => {
    expect(shortDate(new Date("2026-06-07T09:00:00Z"))).toBe("2026-06-07");
  });
});
