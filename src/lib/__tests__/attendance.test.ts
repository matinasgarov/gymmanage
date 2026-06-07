import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// GRANTED check-ins, dated in UTC. Asia/Baku is UTC+4 (no DST).
//  - 2026-06-03 is a Wednesday → Monday-first day index 2
//  - 2026-06-01 is a Monday
const { rows } = vi.hoisted(() => ({
  rows: [
    { scannedAt: new Date("2026-06-03T08:00:00Z") }, // Baku Wed 12:00 → (2, 12)
    { scannedAt: new Date("2026-06-03T08:30:00Z") }, // Baku Wed 12:30 → (2, 12)
    { scannedAt: new Date("2026-06-01T20:00:00Z") }, // Baku Tue 00:00 → (1, 0)
    { scannedAt: new Date("2026-05-01T10:00:00Z") }, // old — outside a 7-day window
  ],
}));

// Mock the tenant client; honor the scannedAt.gte filter so the lookback window
// is actually exercised.
vi.mock("@/lib/tenant", () => ({
  forGym: () => ({
    checkIn: {
      findMany: async ({ where }: { where?: { scannedAt?: { gte?: Date } } }) => {
        const gte = where?.scannedAt?.gte;
        return gte ? rows.filter((r) => r.scannedAt >= gte) : rows;
      },
    },
  }),
}));

import { getAttendanceHeatmap } from "@/lib/attendance";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-07T09:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

function cell(grid: { day: number; hour: number; count: number }[], day: number, hour: number) {
  return grid.find((c) => c.day === day && c.hour === hour);
}

describe("attendance — Asia/Baku bucketing", () => {
  it("buckets UTC timestamps into the correct Baku day-of-week and hour", async () => {
    const res = await getAttendanceHeatmap("gym1", 90);
    expect(res.grid).toHaveLength(7 * 24);
    expect(cell(res.grid, 2, 12)?.count).toBe(2); // two Wed 12:xx Baku
    expect(cell(res.grid, 1, 0)?.count).toBe(1); // Tue 00:00 Baku (crossed midnight)
  });

  it("computes totals, peak hour and peak day", async () => {
    const res = await getAttendanceHeatmap("gym1", 90);
    expect(res.total).toBe(4);
    expect(res.max).toBe(2);
    expect(res.peakHour).toEqual({ hour: 12, count: 2 });
    expect(res.peakDay?.index).toBe(2);
    expect(res.peakDay?.count).toBe(2);
  });

  it("applies the lookback window (7 vs 90 days)", async () => {
    const sevenDay = await getAttendanceHeatmap("gym1", 7);
    const ninetyDay = await getAttendanceHeatmap("gym1", 90);
    // The 2026-05-01 row is inside 90 days of 2026-06-07 but outside 7.
    expect(sevenDay.total).toBe(3);
    expect(ninetyDay.total).toBe(4);
  });

  it("returns null peaks when there are no check-ins in range", async () => {
    // 1 day window → since 2026-06-06; all rows are older.
    const res = await getAttendanceHeatmap("gym1", 1 as unknown as 7);
    expect(res.total).toBe(0);
    expect(res.peakDay).toBeNull();
    expect(res.peakHour).toBeNull();
  });
});
