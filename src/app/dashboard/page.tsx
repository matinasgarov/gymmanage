import Link from "next/link";
import {
  Users,
  AlertTriangle,
  Calendar,
  TrendingDown,
  QrCode,
  ArrowRight,
  Inbox,
  HeartPulse,
  LayoutDashboard,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/dal";
import { getT } from "@/lib/i18n-server";
import { getDashboard, waReminderUrl } from "@/lib/dashboard";
import { formatAZN } from "@/lib/members";
import { RevenueChart } from "@/components/revenue-chart";
import { MonthlyGoalProgress } from "@/components/monthly-goal-progress";

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function daysUntil(d: Date) {
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const t = await getT();
  const data = await getDashboard(user.gymId);

  const atRiskCount = data.atRisk.ghosters + data.atRisk.lapsers;
  const churnSignal = data.churnRate >= 10 ? "purple" : data.churnRate >= 5 ? "warn" : "teal";

  return (
    <AppShell>
      <div
        className="text-white"
        style={{ background: "linear-gradient(135deg, #0f2044, var(--sidebar-bg))" }}
      >
        <div className="px-4 lg:px-8 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-white/10">
              <LayoutDashboard className="w-5 h-5" style={{ color: "#3b7bf6" }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold leading-tight truncate text-white">
                {t("nav.dashboard")}
              </h1>
              <p className="text-xs mt-0.5 truncate text-white/70">
                {t("dashboard.activeMembers")}: {data.activeCount}
              </p>
            </div>
          </div>
          <Link
            href="/members/new"
            className="shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "#3b7bf6" }}
          >
            {t("dashboard.newMember")}
          </Link>
        </div>
      </div>
      <div className="dash min-h-full px-6 py-6 space-y-[18px]">

        {/* Monthly recap entry point — labelled link only, no numbers duplicated here */}
        <Link href="/recap" className="md-edit-btn" style={{ alignSelf: "flex-start" }}>
          {t("recap.ctaFromDashboard")}
        </Link>

        {/* ── Alert pills ─────────────────────────────────── */}
        {(data.newLeadsCount > 0 || atRiskCount > 0 || data.collect.people > 0) && (
          <div className="flex flex-wrap gap-2">
            {data.collect.people > 0 && (
              <Link
                href="/reminders"
                className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ background: "rgba(245,158,11,.1)", color: "#f59e0b" }}
              >
                <AlertTriangle className="w-4 h-4" />
                {t("dashboard.collectPill", {
                  amount: data.collect.amount.toFixed(2),
                  people: data.collect.people,
                })}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
            {data.newLeadsCount > 0 && (
              <Link
                href="/leads?status=NEW"
                className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ background: "rgba(59,123,246,.12)", color: "#3b7bf6" }}
              >
                <Inbox className="w-4 h-4" />
                {t("dashboard.newLeads", { count: data.newLeadsCount })}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
            {atRiskCount > 0 && (
              <Link
                href="/retention"
                className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-opacity hover:opacity-80"
                style={{ background: "rgba(139,92,246,.1)", color: "#8b5cf6" }}
              >
                <HeartPulse className="w-4 h-4" />
                {t("dashboard.atRisk", { count: atRiskCount })}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        )}

        {/* ── Hero row ────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.7fr] gap-[18px]">

          {/* Check-in card */}
          <div
            className="rounded-2xl p-7 flex flex-col bg-white"
            style={{ boxShadow: "0 4px 24px rgba(0,0,0,.09), 0 1px 4px rgba(0,0,0,.04)" }}
          >
            <div className="flex items-center justify-between">
              <span
                className="text-[10.5px] font-bold uppercase tracking-[0.8px] whitespace-nowrap"
                style={{ color: "#8aa0bc" }}
              >
                {t("dashboard.todayCheckins")}
              </span>
              <div
                className="flex items-center gap-1.5 text-[11.5px] font-bold rounded-full px-2.5 py-1 flex-shrink-0 ml-2"
                style={{ background: "rgba(59,123,246,.12)", color: "#3b7bf6" }}
              >
                <span className="pulse-dot" />
                {t("dashboard.live")}
              </div>
            </div>

            <div
              className="font-extrabold leading-none my-3 tracking-[-4px]"
              style={{ fontSize: "clamp(36px,7vw,52px)", color: "#0b1628" }}
            >
              {data.todayCheckIns > 0 ? data.todayCheckIns : "0"}
            </div>

            <Link href="/scan" className="dash-scan-btn self-start">
              <QrCode className="w-3.5 h-3.5" />
              {t("dashboard.goToScanner")}
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Revenue card — dark */}
          <div
            className="rounded-2xl px-8 py-7 relative overflow-hidden text-white"
            style={{
              background: "#0f2044",
              boxShadow: "0 4px 24px rgba(0,0,0,.2), 0 1px 4px rgba(0,0,0,.1)",
            }}
          >
            {/* Decorative radial blobs */}
            <div
              className="absolute pointer-events-none"
              style={{
                top: -60, right: -60, width: 240, height: 240,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(59,123,246,.1) 0%, transparent 70%)",
              }}
            />
            <div
              className="absolute pointer-events-none"
              style={{
                bottom: -80, left: "60%", width: 200, height: 200,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(59,123,246,.06) 0%, transparent 70%)",
              }}
            />

            <span
              className="block text-[10.5px] font-bold uppercase tracking-[1.1px] mb-2.5"
              style={{ color: "rgba(255,255,255,.38)" }}
            >
              {t("dashboard.monthRevenue")}
            </span>

            <div className="relative z-10">
              <MonthlyGoalProgress
                variant="hero"
                dark
                goal={data.monthlyGoal}
                current={data.monthRevenue}
              />
            </div>
          </div>
        </div>

        {/* ── Stat cards ──────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label={t("dashboard.activeMembers")}
            value={String(data.activeCount)}
            icon={Users}
            border="#3b7bf6"
            iconBg="rgba(59,123,246,.12)"
            iconColor="#3b7bf6"
          />
          <StatCard
            label={t("dashboard.overdue")}
            value={String(data.overdueCount)}
            icon={AlertTriangle}
            border="#f59e0b"
            iconBg="rgba(245,158,11,.1)"
            iconColor="#f59e0b"
            href={data.overdueCount > 0 ? "/payments?filter=unpaid" : undefined}
          />
          <StatCard
            label={t("dashboard.expiringThisWeek")}
            value={String(data.expiringCount)}
            icon={Calendar}
            border="#06b6d4"
            iconBg="rgba(6,182,212,.1)"
            iconColor="#06b6d4"
          />
          <StatCard
            label={t("dashboard.churn")}
            value={`${data.churnRate.toFixed(1)}%`}
            icon={TrendingDown}
            border={churnSignal === "purple" ? "#8b5cf6" : churnSignal === "warn" ? "#f59e0b" : "#3b7bf6"}
            iconBg={churnSignal === "purple" ? "rgba(139,92,246,.1)" : churnSignal === "warn" ? "rgba(245,158,11,.1)" : "rgba(59,123,246,.12)"}
            iconColor={churnSignal === "purple" ? "#8b5cf6" : churnSignal === "warn" ? "#f59e0b" : "#3b7bf6"}
            sub={t("dashboard.churnSub", { cancelled: data.cancelledThisMonth, active: data.activeAtMonthStart })}
          />
        </div>

        {/* ── Revenue chart ───────────────────────────────── */}
        <div
          className="rounded-2xl px-7 py-6 bg-white"
          style={{ boxShadow: "0 1px 3px rgba(0,0,0,.05), 0 2px 8px rgba(0,0,0,.04)" }}
        >
          <RevenueChart data={data.revenueByMonth} />
        </div>

        {/* ── Bottom lists ────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">

          {/* Overdue members */}
          <div
            className="rounded-2xl p-6 bg-white"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,.05), 0 2px 8px rgba(0,0,0,.04)" }}
          >
            <div className="flex items-center justify-between mb-[18px]">
              <h2 className="text-[14.5px] font-bold" style={{ color: "#0b1628" }}>
                {t("dashboard.overdueMembers")}
              </h2>
              <span
                className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                style={{ background: "rgba(59,123,246,.12)", color: "#3b7bf6" }}
              >
                {data.overdueCount} nəfər
              </span>
            </div>
            {data.overdueMembers.length === 0 ? (
              <div className="flex flex-col items-center py-3 gap-2">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-[22px]"
                  style={{ background: "rgba(59,123,246,.12)" }}
                >
                  🎉
                </div>
                <span className="text-[13px] font-semibold" style={{ color: "#8aa0bc" }}>
                  {t("dashboard.noOverdue")}
                </span>
              </div>
            ) : (
              <>
                <ul className="divide-y" style={{ borderColor: "rgba(0,0,0,.06)" }}>
                  {data.overdueMembers.slice(0, 5).map((p) => {
                    const url = waReminderUrl(user.gym, p.member, p.period, formatAZN(p.amount));
                    return (
                      <li key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                        <Link href={`/members/${p.member.id}`} className="min-w-0 flex-1">
                          <div className="text-sm font-semibold truncate" style={{ color: "#0b1628" }}>
                            {p.member.name}
                          </div>
                          <div className="text-[11px]" style={{ color: "#8aa0bc" }}>
                            {p.period} · {formatAZN(p.amount)}
                          </div>
                        </Link>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-3 py-1 shrink-0 font-semibold transition-colors"
                        >
                          {t("common.whatsapp")}
                        </a>
                      </li>
                    );
                  })}
                </ul>
                {data.overdueCount > 0 && (
                  <Link
                    href="/reminders"
                    className="mt-3 block text-center text-sm font-bold rounded-full py-2 transition-colors"
                    style={{ background: "rgba(59,123,246,.12)", color: "#3b7bf6" }}
                  >
                    {t("dashboard.bulkReminder")}
                  </Link>
                )}
              </>
            )}
          </div>

          {/* Expiring this week */}
          <div
            className="rounded-2xl p-6 bg-white"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,.05), 0 2px 8px rgba(0,0,0,.04)" }}
          >
            <div className="flex items-center justify-between mb-[18px]">
              <h2 className="text-[14.5px] font-bold" style={{ color: "#0b1628" }}>
                {t("dashboard.expiringTitle")}
              </h2>
              <span
                className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                style={{ background: "rgba(59,123,246,.12)", color: "#3b7bf6" }}
              >
                {data.expiringCount} nəfər
              </span>
            </div>
            {data.expiringMembers.length === 0 ? (
              <div className="flex flex-col items-center py-3 gap-2">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-[22px]"
                  style={{ background: "rgba(59,123,246,.12)" }}
                >
                  ✅
                </div>
                <span className="text-[13px] font-semibold" style={{ color: "#8aa0bc" }}>
                  {t("dashboard.noExpiring")}
                </span>
              </div>
            ) : (
              <ul className="divide-y" style={{ borderColor: "rgba(0,0,0,.06)" }}>
                {data.expiringMembers.map((m) => {
                  const d = daysUntil(m.expiryDate);
                  const urgent = d <= 2;
                  return (
                    <li key={m.id}>
                      <Link
                        href={`/members/${m.id}`}
                        className="py-2.5 flex items-center justify-between"
                      >
                        <div>
                          <div className="text-sm font-semibold" style={{ color: "#0b1628" }}>
                            {m.name}
                          </div>
                          <div className="text-[11px]" style={{ color: "#8aa0bc" }}>
                            {m.publicId} · {fmtDate(m.expiryDate)}
                          </div>
                        </div>
                        <span
                          className="text-xs px-2.5 py-1 rounded-full font-semibold"
                          style={
                            urgent
                              ? { background: "rgba(245,158,11,.1)", color: "#f59e0b" }
                              : { background: "rgba(59,123,246,.08)", color: "#8aa0bc" }
                          }
                        >
                          {t("units.days", { count: d })}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Bottom spacer */}
        <div className="h-4" />
      </div>
    </AppShell>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  border,
  iconBg,
  iconColor,
  sub,
  href,
}: {
  label: string;
  value: string;
  icon: typeof Users;
  border: string;
  iconBg: string;
  iconColor: string;
  sub?: string;
  href?: string;
}) {
  const body = (
    <div
      className="relative rounded-2xl px-5 pt-5 pb-[18px] flex flex-col gap-[5px] bg-white h-full"
      style={{
        borderLeft: `3.5px solid ${border}`,
        boxShadow: "0 1px 3px rgba(0,0,0,.05), 0 2px 8px rgba(0,0,0,.04)",
      }}
    >
      <div
        className="absolute top-4 right-4 w-9 h-9 rounded-[10px] flex items-center justify-center"
        style={{ background: iconBg }}
      >
        <Icon style={{ width: 17, height: 17, color: iconColor }} strokeWidth={2.2} />
      </div>
      <span
        className="text-[10.5px] font-bold uppercase tracking-[0.8px] pr-10"
        style={{ color: "#8aa0bc" }}
      >
        {label}
      </span>
      <div
        className="font-extrabold leading-none mt-1.5 tracking-[-1.8px]"
        style={{ fontSize: 28, color: "#0b1628" }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-[11.5px]" style={{ color: "#8aa0bc" }}>
          {sub}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block hover:-translate-y-0.5 transition-transform">
        {body}
      </Link>
    );
  }
  return body;
}
