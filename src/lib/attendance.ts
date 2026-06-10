import "server-only";
import { forGym } from "@/lib/tenant";
import { getDictionary, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

function jsDayToMondayFirst(jsDay: number): number {
  return (jsDay + 6) % 7;
}

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
  const hour = Math.min(23, Math.max(0, parseInt(hourStr, 10) % 24));
  return { weekday: jsDayToMondayFirst(weekdayMap[weekdayStr] ?? 0), hour };
}

function bakuDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export type HeatmapCell = { day: number; hour: number; count: number };
export type HeatmapResult = {
  grid: HeatmapCell[];
  max: number;
  total: number;
  totalPrev: number;
  uniqueMembers: number;
  uniqueMembersPrev: number;
  memberEntries: number;
  visitorEntries: number;
  visitorEntriesPrev: number;
  dailyAvg: number;
  dailyAvgPrev: number;
  dailyBuckets: { date: string; count: number }[];
  dayTotals: number[];
  peakDay: { index: number; label: string; count: number } | null;
  peakHour: { hour: number; count: number } | null;
  dayLabels: string[];
  dayLabelsFull: string[];
};

export async function getAttendanceHeatmap(
  gymId: string,
  days: 7 | 30 | 90 = 30,
  locale: Locale = DEFAULT_LOCALE
): Promise<HeatmapResult> {
  const dict = getDictionary(locale);
  const DAY_LABELS = dict.weekdaysShort as string[];
  const DAY_LABELS_FULL = dict.weekdaysFull as string[];

  const now = new Date();
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - days);
  const prevSince = new Date(since);
  prevSince.setUTCDate(prevSince.getUTCDate() - days);

  const db = forGym(gymId);
  const [rows, prevRows] = await Promise.all([
    db.checkIn.findMany({
      where: { result: "GRANTED", scannedAt: { gte: since } },
      select: { scannedAt: true, memberId: true, visitorPassId: true },
    }),
    db.checkIn.findMany({
      where: { result: "GRANTED", scannedAt: { gte: prevSince, lt: since } },
      select: { memberId: true, visitorPassId: true },
    }),
  ]);

  const grid = Array.from({ length: 7 }, (_, d) =>
    Array.from({ length: 24 }, (_, h) => ({ day: d, hour: h, count: 0 }))
  );
  let total = 0;
  let max = 0;
  let memberEntries = 0;
  let visitorEntries = 0;
  const dayTotals = new Array(7).fill(0);
  const hourTotals = new Array(24).fill(0);
  const memberIdSet = new Set<string>();

  // Build daily bucket map seeded with all days in the period (shows zero days too)
  const bucketMap = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const key = bakuDate(d);
    if (!bucketMap.has(key)) bucketMap.set(key, 0);
  }

  for (const r of rows) {
    const { weekday, hour } = bakuParts(r.scannedAt);
    grid[weekday][hour].count++;
    total++;
    dayTotals[weekday]++;
    hourTotals[hour]++;
    if (grid[weekday][hour].count > max) max = grid[weekday][hour].count;

    if (r.memberId) {
      memberEntries++;
      memberIdSet.add(r.memberId);
    } else {
      visitorEntries++;
    }

    const dateKey = bakuDate(r.scannedAt);
    bucketMap.set(dateKey, (bucketMap.get(dateKey) ?? 0) + 1);
  }

  let visitorEntriesPrev = 0;
  const prevMemberIdSet = new Set<string>();
  for (const r of prevRows) {
    if (r.memberId) prevMemberIdSet.add(r.memberId);
    else visitorEntriesPrev++;
  }

  let peakDayIdx = -1;
  let peakDayCount = 0;
  dayTotals.forEach((c, i) => {
    if (c > peakDayCount) { peakDayCount = c; peakDayIdx = i; }
  });
  let peakHourIdx = -1;
  let peakHourCount = 0;
  hourTotals.forEach((c, i) => {
    if (c > peakHourCount) { peakHourCount = c; peakHourIdx = i; }
  });

  return {
    grid: grid.flat(),
    max,
    total,
    totalPrev: prevRows.length,
    uniqueMembers: memberIdSet.size,
    uniqueMembersPrev: prevMemberIdSet.size,
    memberEntries,
    visitorEntries,
    visitorEntriesPrev,
    dailyAvg: total / days,
    dailyAvgPrev: prevRows.length / days,
    dailyBuckets: Array.from(bucketMap.entries()).map(([date, count]) => ({ date, count })),
    dayTotals,
    peakDay:
      peakDayIdx >= 0
        ? { index: peakDayIdx, label: DAY_LABELS_FULL[peakDayIdx], count: peakDayCount }
        : null,
    peakHour: peakHourIdx >= 0 ? { hour: peakHourIdx, count: peakHourCount } : null,
    dayLabels: DAY_LABELS,
    dayLabelsFull: DAY_LABELS_FULL,
  };
}
