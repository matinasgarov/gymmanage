import Link from "next/link";
import {
  Activity,
  CalendarDays,
  Users,
  UserPlus,
  TrendingUp,
  Grid3x3,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { requireOwner } from "@/lib/dal";
import { getLocale, getT } from "@/lib/i18n-server";
import { getAttendanceHeatmap } from "@/lib/attendance";
import { Heatmap } from "@/components/heatmap";
import { DailyTrendChart } from "@/components/daily-trend-chart";
import type { TFunction } from "@/lib/i18n";
import type { LucideIcon } from "lucide-react";

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

  function hintText(trend: number | null, t: TFunction): string {
    if (trend === null) return t("attendance.noDataPrev");
    return `${trend > 0 ? "+" : ""}${trend}% ${t("attendance.vsPrev")}`;
  }

  const entryTotal = data.memberEntries + data.visitorEntries;
  const memberPct = entryTotal > 0 ? Math.round((data.memberEntries / entryTotal) * 100) : 0;
  const visitorPct = 100 - memberPct;

  const periodTabs = (
    <div style={{ display: "flex", gap: 3, background: "rgba(255,255,255,.12)", padding: 4, borderRadius: 12 }}>
      {TABS.map((tb) => (
        <Link
          key={tb.value}
          href={`/attendance?range=${tb.value}`}
          style={
            tab.value === tb.value
              ? { display: "block", padding: "6px 18px", borderRadius: 9, fontSize: 13, fontWeight: 700, background: "white", color: "#3b7bf6", boxShadow: "0 2px 8px rgba(11,22,40,.15)", textDecoration: "none", whiteSpace: "nowrap" }
              : { display: "block", padding: "6px 18px", borderRadius: 9, fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,.65)", textDecoration: "none", whiteSpace: "nowrap" }
          }
        >
          {tb.label}
        </Link>
      ))}
    </div>
  );

  return (
    <AppShell>
      <PageHeader
        title={t("attendance.title")}
        subtitle={user.gym.name}
        icon={Activity}
        tone="dark"
        actions={periodTabs}
      />

      <div className="dash min-h-full px-4 lg:px-7 py-6 space-y-[18px]">

        {/* ── Stat cards ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            accent="#3b7bf6"
            iconBg="rgba(59,123,246,.12)"
            iconColor="#3b7bf6"
            icon={Users}
            label={t("attendance.totalEntries")}
            value={String(data.total)}
            hint={hintText(totalTrend, t)}
          />
          <StatCard
            accent="#06b6d4"
            iconBg="rgba(6,182,212,.15)"
            iconColor="#06b6d4"
            icon={Activity}
            label={t("attendance.dailyAvg")}
            value={data.dailyAvg.toFixed(1)}
            hint={hintText(avgTrend, t)}
          />
          <StatCard
            accent="#10b981"
            iconBg="rgba(16,185,129,.12)"
            iconColor="#10b981"
            icon={UserPlus}
            label={t("attendance.uniqueMembers")}
            value={String(data.uniqueMembers)}
            hint={hintText(membersTrend, t)}
          />
          <StatCard
            accent="#8b5cf6"
            iconBg="rgba(139,92,246,.1)"
            iconColor="#8b5cf6"
            icon={CalendarDays}
            label={t("attendance.visitorEntries")}
            value={String(data.visitorEntries)}
            hint={hintText(visitorTrend, t)}
          />
        </div>

        {/* ── Daily trend chart ─────────────────────────────────── */}
        <div style={{ background: "white", borderRadius: 16, padding: "22px 24px", boxShadow: "var(--d-sh1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, fontSize: 14, fontWeight: 700, color: "var(--d-tx)" }}>
            <TrendingUp style={{ width: 16, height: 16, color: "var(--d-accent)" }} />
            {t("attendance.sectionTrend")}
          </div>
          <div style={{ height: 180 }}>
            <DailyTrendChart buckets={data.dailyBuckets} />
          </div>
        </div>

        {/* ── Split row: DOW bars | Ratio ──────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px]">
          {/* Day of week horizontal bars */}
          <div style={{ background: "white", borderRadius: 16, padding: "22px 24px", boxShadow: "var(--d-sh1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, fontSize: 14, fontWeight: 700, color: "var(--d-tx)" }}>
              <CalendarDays style={{ width: 16, height: 16, color: "var(--d-accent)" }} />
              {t("attendance.sectionByDay")}
            </div>
            <DayOfWeekBars dayTotals={data.dayTotals} dayLabels={data.dayLabels} />
          </div>

          {/* Member / Visitor ratio */}
          <div style={{ background: "white", borderRadius: 16, padding: "22px 24px", boxShadow: "var(--d-sh1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, fontSize: 14, fontWeight: 700, color: "var(--d-tx)" }}>
              <Users style={{ width: 16, height: 16, color: "var(--d-accent)" }} />
              {t("attendance.memberVsVisitor")}
            </div>
            {/* Ratio bar */}
            <div style={{ height: 10, borderRadius: 99, background: "var(--d-bg)", display: "flex", overflow: "hidden", marginBottom: 16 }}>
              {memberPct > 0 && (
                <div style={{ width: `${memberPct}%`, background: "var(--d-accent)", borderRadius: "99px 0 0 99px" }} />
              )}
              {visitorPct > 0 && (
                <div style={{ width: `${visitorPct}%`, background: "#06b6d4", borderRadius: memberPct === 0 ? "99px" : "0 99px 99px 0" }} />
              )}
            </div>
            {/* Legend */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--d-tx)" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--d-accent)", flexShrink: 0, display: "inline-block" }} />
                  {t("attendance.members")}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--d-tx2)" }}>
                  {data.memberEntries} ({memberPct}%)
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--d-tx)" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#06b6d4", flexShrink: 0, display: "inline-block" }} />
                  {t("attendance.visitors")}
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--d-tx2)" }}>
                  {data.visitorEntries} ({visitorPct}%)
                </span>
              </div>
            </div>
            {/* Divider */}
            <div style={{ height: 1, background: "var(--d-bdr)", margin: "4px 0 8px" }} />
            {/* Peak stats */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--d-bdr)" }}>
              <span style={{ fontSize: 12.5, color: "var(--d-tx3)", fontWeight: 600 }}>
                {t("attendance.peakDay")}
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--d-tx)", letterSpacing: "-0.3px" }}>
                {data.peakDay
                  ? <>{data.peakDay.label}<span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--d-tx3)", marginLeft: 4 }}>({data.peakDay.count})</span></>
                  : "—"}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0" }}>
              <span style={{ fontSize: 12.5, color: "var(--d-tx3)", fontWeight: 600 }}>
                {t("attendance.peakHour")}
              </span>
              <span style={{ fontSize: 13, fontWeight: 800, color: "var(--d-tx)", letterSpacing: "-0.3px" }}>
                {data.peakHour
                  ? <>{data.peakHour.hour.toString().padStart(2, "0")}:00<span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--d-tx3)", marginLeft: 4 }}>({data.peakHour.count})</span></>
                  : "—"}
              </span>
            </div>
          </div>
        </div>

        {/* ── Heatmap ───────────────────────────────────────────── */}
        <div style={{ background: "white", borderRadius: 16, padding: "22px 24px", boxShadow: "var(--d-sh1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, fontSize: 14, fontWeight: 700, color: "var(--d-tx)" }}>
            <Grid3x3 style={{ width: 16, height: 16, color: "var(--d-accent)" }} />
            {t("attendance.heatmapTitle")}
          </div>
          {data.total === 0 ? (
            <p style={{ fontSize: 14, color: "var(--d-tx3)", textAlign: "center", padding: "32px 0" }}>
              {t("attendance.noEntries")}
            </p>
          ) : (
            <Heatmap data={data} />
          )}
        </div>

      </div>
    </AppShell>
  );
}

// ─── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({
  accent,
  iconBg,
  iconColor,
  icon: Icon,
  label,
  value,
  hint,
}: {
  accent: string;
  iconBg: string;
  iconColor: string;
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div style={{ background: "white", borderRadius: 16, padding: "20px 20px 18px", boxShadow: "var(--d-sh1)", position: "relative", display: "flex", flexDirection: "column", gap: 5, overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: accent, borderRadius: "16px 16px 0 0" }} />
      <div style={{ position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: 10, background: iconBg, color: iconColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon style={{ width: 17, height: 17 }} />
      </div>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.9px", textTransform: "uppercase", color: "var(--d-tx3)", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-1.8px", lineHeight: 1, marginTop: 6, color: "var(--d-tx)" }}>
        {value}
      </div>
      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--d-tx3)", fontStyle: "italic" }}>
        {hint}
      </span>
    </div>
  );
}

// ─── DayOfWeekBars ─────────────────────────────────────────────────────────────

function DayOfWeekBars({
  dayTotals,
  dayLabels,
}: {
  dayTotals: number[];
  dayLabels: string[];
}) {
  const max = Math.max(1, ...dayTotals);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {dayTotals.map((count, i) => {
        const isDominant = count > 0 && count === Math.max(...dayTotals);
        const barColor = isDominant
          ? "#3b7bf6"
          : count > 0
          ? "rgba(59,123,246,.45)"
          : "rgba(59,123,246,.1)";
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 28, fontSize: 12, fontWeight: 700, color: "var(--d-tx3)", textAlign: "right", flexShrink: 0 }}>
              {dayLabels[i]}
            </div>
            <div style={{ flex: 1, height: 20, background: "var(--d-bg)", borderRadius: 5, overflow: "hidden" }}>
              <div
                style={{
                  width: `${(count / max) * 100}%`,
                  height: "100%",
                  background: barColor,
                  borderRadius: 5,
                  transition: "width 0.5s ease",
                }}
              />
            </div>
            <div style={{ width: 28, fontSize: 11, fontWeight: 700, color: "var(--d-tx3)", textAlign: "right", flexShrink: 0, tabularNums: true } as React.CSSProperties}>
              {count}
            </div>
          </div>
        );
      })}
    </div>
  );
}
