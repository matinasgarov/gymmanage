import "server-only";
import { forGym } from "@/lib/tenant";

// Days are Monday-first (per AZ convention). Index 0 = Monday, 6 = Sunday.
const DAY_LABELS = ["B.e", "Ç.a", "Ç", "C.a", "C", "Ş", "B"];
const DAY_LABELS_FULL = [
  "Bazar ertəsi",
  "Çərşənbə axşamı",
  "Çərşənbə",
  "Cümə axşamı",
  "Cümə",
  "Şənbə",
  "Bazar",
];

// JS Date#getDay returns 0..6 with 0=Sunday. Convert to Monday-first 0..6.
function jsDayToMondayFirst(jsDay: number): number {
  return (jsDay + 6) % 7;
}

// Format a Date into Asia/Baku parts. Avoids any third-party tz lib.
function bakuParts(d: Date): { weekday: number; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Baku",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  // Intl returns 24 for midnight in some locales — coerce.
  const hour = Math.min(23, Math.max(0, parseInt(hourStr, 10) % 24));
  return { weekday: jsDayToMondayFirst(weekdayMap[weekdayStr] ?? 0), hour };
}

export type HeatmapCell = { day: number; hour: number; count: number };
export type HeatmapResult = {
  grid: HeatmapCell[];
  max: number;
  total: number;
  peakDay: { index: number; label: string; count: number } | null;
  peakHour: { hour: number; count: number } | null;
  dayLabels: string[];
  dayLabelsFull: string[];
};

export async function getAttendanceHeatmap(
  gymId: string,
  days: 7 | 30 | 90 = 30
): Promise<HeatmapResult> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);

  const rows = await forGym(gymId).checkIn.findMany({
    where: { result: "GRANTED", scannedAt: { gte: since } },
    select: { scannedAt: true },
  });

  const grid = Array.from({ length: 7 }, (_, d) =>
    Array.from({ length: 24 }, (_, h) => ({ day: d, hour: h, count: 0 }))
  );
  let total = 0;
  let max = 0;
  const dayTotals = new Array(7).fill(0);
  const hourTotals = new Array(24).fill(0);

  for (const r of rows) {
    const { weekday, hour } = bakuParts(r.scannedAt);
    grid[weekday][hour].count++;
    total++;
    dayTotals[weekday]++;
    hourTotals[hour]++;
    if (grid[weekday][hour].count > max) max = grid[weekday][hour].count;
  }

  let peakDayIdx = -1;
  let peakDayCount = 0;
  dayTotals.forEach((c, i) => {
    if (c > peakDayCount) {
      peakDayCount = c;
      peakDayIdx = i;
    }
  });
  let peakHourIdx = -1;
  let peakHourCount = 0;
  hourTotals.forEach((c, i) => {
    if (c > peakHourCount) {
      peakHourCount = c;
      peakHourIdx = i;
    }
  });

  return {
    grid: grid.flat(),
    max,
    total,
    peakDay:
      peakDayIdx >= 0
        ? { index: peakDayIdx, label: DAY_LABELS_FULL[peakDayIdx], count: peakDayCount }
        : null,
    peakHour: peakHourIdx >= 0 ? { hour: peakHourIdx, count: peakHourCount } : null,
    dayLabels: DAY_LABELS,
    dayLabelsFull: DAY_LABELS_FULL,
  };
}
