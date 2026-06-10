import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const { activeMembers, lapsedMembers, lastGranted } = vi.hoisted(() => ({
  // startDate matters only for never-entered members: a member who joined
  // within the threshold hasn't had time to "ghost" yet.
  activeMembers: [
    { id: "a", name: "Ayan", phone: "+994501112233", publicId: "M-1", photoUrl: null, startDate: new Date("2026-04-01T00:00:00Z") },
    { id: "b", name: "Babək", phone: "+994502223344", publicId: "M-2", photoUrl: null, startDate: new Date("2026-04-01T00:00:00Z") },
    { id: "c", name: "Cavid", phone: "+994503334455", publicId: "M-3", photoUrl: null, startDate: new Date("2026-05-01T00:00:00Z") },
    // Deniz joined yesterday and has never entered — must NOT be a ghoster yet.
    { id: "d", name: "Deniz", phone: "+994505556677", publicId: "M-4", photoUrl: null, startDate: new Date("2026-06-06T00:00:00Z") },
  ],
  lapsedMembers: [
    {
      id: "l",
      name: "Leyla",
      phone: "+994504445566",
      publicId: "M-9",
      photoUrl: null,
      status: "EXPIRED",
      expiryDate: new Date("2026-06-01T00:00:00Z"),
      cancelledAt: null,
    },
  ],
  // Ayan last seen 18 days ago (ghoster), Babək 2 days ago (active), Cavid never.
  lastGranted: [
    { memberId: "a", _max: { scannedAt: new Date("2026-05-20T00:00:00Z") } },
    { memberId: "b", _max: { scannedAt: new Date("2026-06-05T00:00:00Z") } },
  ],
}));

vi.mock("@/lib/tenant", () => ({
  forGym: () => ({
    member: {
      findMany: async ({ where }: { where: { status: unknown } }) =>
        where.status === "ACTIVE" ? activeMembers : lapsedMembers,
    },
    checkIn: {
      groupBy: async () => lastGranted,
    },
  }),
}));

import {
  getRetentionData,
  getAtRiskCounts,
  winBackMessage,
} from "@/lib/retention";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-07T09:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

describe("retention — ghosters (active but absent ≥14 days)", () => {
  it("surfaces never-entered first, then by longest absence", async () => {
    const { ghosters } = await getRetentionData("gym1");
    expect(ghosters.map((g) => g.id)).toEqual(["c", "a"]);
    expect(ghosters[0].daysSince).toBeNull(); // Cavid never checked in
    expect(ghosters[1].daysSince).toBe(18); // Ayan, 18 days ago
  });

  it("excludes members seen within the threshold", async () => {
    const { ghosters } = await getRetentionData("gym1");
    expect(ghosters.find((g) => g.id === "b")).toBeUndefined(); // Babək seen recently
  });

  it("excludes never-entered members still within their joining grace", async () => {
    const { ghosters } = await getRetentionData("gym1");
    // Deniz joined yesterday: never came, but not yet at risk.
    expect(ghosters.find((g) => g.id === "d")).toBeUndefined();
  });
});

describe("retention — lapsers (expired/cancelled within the window)", () => {
  it("categorizes expired accounts with days since expiry", async () => {
    const { lapsers } = await getRetentionData("gym1");
    expect(lapsers).toHaveLength(1);
    expect(lapsers[0].id).toBe("l");
    expect(lapsers[0].daysSince).toBe(6); // expired 2026-06-01 → 6 days
  });
});

describe("retention — counts + win-back copy", () => {
  it("aggregates counts and a name sample", async () => {
    const counts = await getAtRiskCounts("gym1");
    expect(counts).toMatchObject({ ghosters: 2, lapsers: 1 });
    expect(counts.sample).toEqual(["Cavid", "Ayan", "Leyla"]);
  });

  it("uses distinct messages per risk kind", () => {
    expect(winBackMessage({ name: "Ayan" }, "ghoster")).toContain("görmürük");
    expect(winBackMessage({ name: "Leyla" }, "lapser")).toContain("başa çatıb");
  });
});
