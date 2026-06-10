import Link from "next/link";
import {
  Activity,
  Clock,
  CalendarDays,
  Users,
  UserCheck,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { requireOwner } from "@/lib/dal";
import { getLocale, getT } from "@/lib/i18n-server";
import { getAttendanceHeatmap } from "@/lib/attendance";
import { Heatmap } from "@/components/heatmap";
import { DailyTrendChart } from "@/components/daily-trend-chart";
import type { TFunction } from "@/lib/i18n";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await requireOwner();
  const [locale, t] = await Promise.all([getLocale(), getT()]);

  const TABS: { value: string; label: string; days: 7 | 30 | 90 }[] = [
    { value: "7", label: t("attendance.tab7"), days: 7 },
    { value: "30", label: t("attendance.tab30"), days: 30 },
    { value: "90", label: t("attendance.tab90"), days: 90 },
  ];

  const { range } = await searchParams;
  const tab = TABS.find((tb) => tb.value === range) ?? TABS[1];
  const data = await getAttendanceHeatmap(user.gymId, tab.days, locale);

  function trendPct(current: number, prev: number): number | null {
    if (prev === 0) return null;
    return Math.round(((current - prev) / prev) * 100);
  }

  const totalTrend = trendPct(data.total, data.totalPrev);
  const avgTrend = trendPct(
    Math.round(data.dailyAvg * 10),
    Math.round(data.dailyAvgPrev * 10)
  );
  const membersTrend = trendPct(data.uniqueMembers, data.uniqueMembersPrev);
  const visitorTrend = trendPct(data.visitorEntries, data.visitorEntriesPrev);

  const hasData = data.total > 0;

  return (
    <AppShell>
      <PageHeader
        title={t("attendance.title")}
        subtitle={t("attendance.subtitle")}
        icon={Activity}
        tone="dark"
        tabs={
          <nav className="flex gap-1 -mb-px text-sm">
            {TABS.map((tb) => (
              <Link
                key={tb.value}
                href={`/attendance?range=${tb.value}`}
                className={`px-4 py-2.5 border-b-2 -mb-px transition-colors ${
                  tab.value === tb.value
                    ? "border-[var(--brand)] text-white"
                    : "border-transparent text-white/60 hover:text-white"
                }`}
              >
                {tb.label}
              </Link>
            ))}
          </nav>
        }
      />

      <div className="px-4 lg:px-8 py-6 space-y-4">
        {/* KPI cards — 2×2 on mobile, 4 across on desktop */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label={t("attendance.totalEntries")}
            value={String(data.total)}
            icon={Users}
            trend={totalTrend}
            t={t}
          />
          <KpiCard
            label={t("attendance.dailyAvg")}
            value={data.dailyAvg.toFixed(1)}
            icon={Activity}
            trend={avgTrend}
            t={t}
          />
          <KpiCard
            label={t("attendance.uniqueMembers")}
            value={String(data.uniqueMembers)}
            icon={UserCheck}
            trend={membersTrend}
            t={t}
          />
          <KpiCard
            label={t("attendance.visitorEntries")}
            value={String(data.visitorEntries)}
            icon={CalendarDays}
            trend={visitorTrend}
            t={t}
          />
        </section>

        {/* Daily trend sparkline */}
        {hasData && (
          <section className="card p-5">
            <h2 className="text-sm font-medium mb-3">{t("attendance.sectionTrend")}</h2>
            <DailyTrendChart buckets={data.dailyBuckets} />
          </section>
        )}

        {/* Breakdown row */}
        {hasData && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Day-of-week bars */}
            <div className="card p-5">
              <h2 className="text-sm font-medium mb-4">{t("attendance.sectionByDay")}</h2>
              <DayOfWeekBars dayTotals={data.dayTotals} dayLabels={data.dayLabels} />
            </div>

            {/* Member vs Visitor split + peak stats */}
            <div className="card p-5">
              <h2 className="text-sm font-medium mb-4">{t("attendance.memberVsVisitor")}</h2>
              <MemberVisitorSplit
                memberCount={data.memberEntries}
                visitorCount={data.visitorEntries}
                memberLabel={t("attendance.members")}
                visitorLabel={t("attendance.visitors")}
              />
              <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-3">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--muted)]">{t("attendance.peakDay")}</span>
                  <span className="font-medium">
                    {data.peakDay
                      ? `${data.peakDay.label} (${data.peakDay.count})`
                      : "—"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--muted)]">{t("attendance.peakHour")}</span>
                  <span className="font-medium">
                    {data.peakHour
                      ? `${data.peakHour.hour.toString().padStart(2, "0")}:00 (${data.peakHour.count})`
                      : "—"}
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Heatmap */}
        <section className="card p-5">
          <h2 className="text-sm font-medium mb-3">{t("attendance.heatmapTitle")}</h2>
          {!hasData ? (
            <p className="text-sm text-[var(--muted)] py-8 text-center">
              {t("attendance.noEntries")}
            </p>
          ) : (
            <Heatmap data={data} />
          )}
        </section>
      </div>
    </AppShell>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  trend,
  t,
}: {
  label: string;
  value: string;
  icon: typeof Users;
  trend: number | null;
  t: TFunction;
}) {
  const isUp = trend !== null && trend > 0;
  const isDown = trend !== null && trend < 0;
  const trendColor = isUp
    ? "text-emerald-600"
    : isDown
      ? "text-red-500"
      : "text-[var(--muted)]";

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wide text-[var(--muted)] leading-tight">
            {label}
          </div>
          <div className="text-xl font-semibold mt-1 tabular-nums">{value}</div>
          <div className={`flex items-center gap-0.5 mt-1 text-[11px] ${trendColor}`}>
            {trend === null ? (
              <span className="text-[var(--muted)]">{t("attendance.noDataPrev")}</span>
            ) : (
              <>
                {isUp ? (
                  <TrendingUp className="w-3 h-3 shrink-0" />
                ) : isDown ? (
                  <TrendingDown className="w-3 h-3 shrink-0" />
                ) : (
                  <Minus className="w-3 h-3 shrink-0" />
                )}
                <span>
                  {trend > 0 ? "+" : ""}
                  {trend}% {t("attendance.vsPrev")}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="w-9 h-9 rounded-lg bg-[var(--brand-soft)] text-[var(--brand-strong)] flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}

function DayOfWeekBars({
  dayTotals,
  dayLabels,
}: {
  dayTotals: number[];
  dayLabels: string[];
}) {
  const max = Math.max(1, ...dayTotals);
  return (
    <div className="space-y-2">
      {dayTotals.map((count, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-7 text-[11px] text-[var(--muted)] text-right shrink-0">
            {dayLabels[i]}
          </div>
          <div className="flex-1 h-4 bg-[var(--background)] rounded overflow-hidden">
            <div
              className="h-full rounded transition-all"
              style={{
                width: `${(count / max) * 100}%`,
                backgroundColor: "var(--brand)",
                opacity: 0.3 + (count / max) * 0.7,
              }}
            />
          </div>
          <div className="w-8 text-[11px] text-[var(--muted)] text-right shrink-0 tabular-nums">
            {count}
          </div>
        </div>
      ))}
    </div>
  );
}

function MemberVisitorSplit({
  memberCount,
  visitorCount,
  memberLabel,
  visitorLabel,
}: {
  memberCount: number;
  visitorCount: number;
  memberLabel: string;
  visitorLabel: string;
}) {
  const total = memberCount + visitorCount;
  if (total === 0) return <div className="text-sm text-[var(--muted)]">—</div>;

  const memberPct = Math.round((memberCount / total) * 100);
  const visitorPct = 100 - memberPct;

  return (
    <div>
      <div className="flex h-4 rounded-full overflow-hidden mb-3">
        {memberCount > 0 && (
          <div
            className="h-full bg-[var(--brand)]"
            style={{ width: `${memberPct}%` }}
          />
        )}
        {visitorCount > 0 && (
          <div
            className="h-full bg-sky-400"
            style={{ width: `${visitorPct}%` }}
          />
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-[var(--brand)] shrink-0" />
            {memberLabel}
          </span>
          <span className="font-medium tabular-nums">
            {memberCount}{" "}
            <span className="text-[var(--muted)] font-normal">({memberPct}%)</span>
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm bg-sky-400 shrink-0" />
            {visitorLabel}
          </span>
          <span className="font-medium tabular-nums">
            {visitorCount}{" "}
            <span className="text-[var(--muted)] font-normal">({visitorPct}%)</span>
          </span>
        </div>
      </div>
    </div>
  );
}
