import Link from "next/link";
import { Sparkles, ShieldCheck, MessageCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { requireOwner } from "@/lib/dal";
import { getT } from "@/lib/i18n-server";
import { getMonthlyRecap, getRecapTrend } from "@/lib/recap";
import { REASON_CODE } from "@/lib/scan-reasons";

const AZ_MONTHS = ["Yanvar","Fevral","Mart","Aprel","May","İyun","İyul","Avqust","Sentyabr","Oktyabr","Noyabr","Dekabr"];

// Parse ?ym=YYYY-MM (1-indexed month) into a 0-indexed {year, month}; default = current.
function parseYm(ym: string | undefined): { year: number; month: number } {
  const now = new Date();
  if (ym) {
    const m = /^(\d{4})-(\d{2})$/.exec(ym);
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]) - 1;
      if (month >= 0 && month <= 11) return { year, month };
    }
  }
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
}

function ymString(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export default async function RecapPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const user = await requireOwner(); // owner-only route
  const t = await getT();
  const { ym } = await searchParams;
  const { year, month } = parseYm(ym);

  const [recap, trend] = await Promise.all([
    getMonthlyRecap(user.gymId, year, month),
    getRecapTrend(user.gymId, year, month, 6),
  ]);

  // Month paging, capped to the last 12 months and not beyond the current month.
  const now = new Date();
  const curIdx = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const viewIdx = year * 12 + month;
  const prev = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month + 1, 1));
  const canPrev = curIdx - (viewIdx - 1) <= 11; // don't page past 12 months back
  const canNext = viewIdx < curIdx;

  const maxTrend = Math.max(1, ...trend.map((p) => p.reminderCollected));

  return (
    <AppShell>
      <PageHeader title={t("recap.title")} subtitle={t("recap.subtitle")} icon={Sparkles} tone="dark" />
      <div className="dash min-h-full px-4 lg:px-7 py-6" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Month pager */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          {canPrev ? (
            <Link href={`/recap?ym=${ymString(prev.getUTCFullYear(), prev.getUTCMonth())}`} className="md-edit-btn">
              <ChevronLeft className="w-4 h-4" /> {t("recap.prevMonth")}
            </Link>
          ) : <span />}
          <span style={{ fontSize: 15, fontWeight: 800, color: "var(--d-tx)" }}>
            {AZ_MONTHS[month]} {year}
          </span>
          {canNext ? (
            <Link href={`/recap?ym=${ymString(next.getUTCFullYear(), next.getUTCMonth())}`} className="md-edit-btn">
              {t("recap.nextMonth")} <ChevronRight className="w-4 h-4" />
            </Link>
          ) : <span />}
        </div>

        {/* Two hero stats — the numbers nothing else shows */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ background: "white", borderRadius: 16, boxShadow: "var(--d-sh1)", padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(16,185,129,.12)", color: "#10b981", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <MessageCircle className="w-3.5 h-3.5" />
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--d-tx3)" }}>{t("recap.reminderCollected")}</span>
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-1px", color: "var(--d-tx)" }}>
              {recap.reminderCollected.toFixed(2)} ₼
            </div>
            <div style={{ fontSize: 11.5, color: "var(--d-tx3)", marginTop: 4 }}>
              {t("recap.ofTotal", { amount: recap.reminderCollected.toFixed(2), total: recap.totalRevenue.toFixed(2) })}
            </div>
          </div>

          <div style={{ background: "white", borderRadius: 16, boxShadow: "var(--d-sh1)", padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(59,123,246,.12)", color: "#3b7bf6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--d-tx3)" }}>{t("recap.blocked")}</span>
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-1px", color: "var(--d-tx)" }}>
              {recap.blockedCount}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--d-tx3)", marginTop: 4 }}>
              {recap.blockedByReason.map((b) => {
                const code = REASON_CODE[b.reason];
                const label = code ? t(`recap.reason${code.charAt(0).toUpperCase() + code.slice(1)}`) : b.reason;
                return `${label}: ${b.count}`;
              }).join(" · ") || (recap.sharingSignalCount > 0 ? `${t("recap.sharingSignal")}: ${recap.sharingSignalCount}` : "—")}
            </div>
          </div>
        </div>

        {/* 6-month trend of reminder-collected (distinct from the Panel's revenue chart) */}
        <div style={{ background: "white", borderRadius: 16, boxShadow: "var(--d-sh1)", padding: "20px 22px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--d-tx)", marginBottom: 14 }}>{t("recap.trendTitle")}</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 120 }}>
            {trend.map((p) => (
              <div key={`${p.year}-${p.month}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ width: "100%", display: "flex", alignItems: "flex-end", height: 90 }}>
                  <div style={{ width: "100%", borderRadius: "6px 6px 0 0", background: "#3b7bf6", height: `${Math.round((p.reminderCollected / maxTrend) * 100)}%`, minHeight: p.reminderCollected > 0 ? 4 : 0 }} />
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--d-tx3)" }}>{AZ_MONTHS[p.month].slice(0, 3)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
