import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  CalendarClock,
  TrendingDown,
  Inbox,
  HeartPulse,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
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
  const churnSignal: Signal =
    data.churnRate >= 10 ? "danger" : data.churnRate >= 5 ? "warn" : "neutral";

  return (
    <AppShell>
      <PageHeader
        title={t("nav.dashboard")}
        subtitle={user.gym.name}
        icon={LayoutDashboard}
        tone="dark"
        actions={
          <Link href="/members/new" className="btn-brand hidden sm:inline-flex items-center gap-2">
            <span>{t("dashboard.newMember")}</span>
          </Link>
        }
      />

      <div className="px-4 lg:px-8 py-6 space-y-6">
        {/* TIER 1 — alerts. Slim pills, only when something needs attention. */}
        {(data.newLeadsCount > 0 || atRiskCount > 0 || data.collect.people > 0) && (
          <div className="flex flex-wrap gap-2">
            {data.collect.people > 0 && (
              <Link
                href="/reminders"
                className="inline-flex items-center gap-2 rounded-full bg-amber-50 text-amber-700 px-3.5 py-1.5 text-sm font-medium transition-opacity hover:opacity-80"
              >
                <AlertTriangle className="w-4 h-4" />
                {t("dashboard.collectPill", {
                  amount: data.collect.amount.toFixed(2),
                  people: data.collect.people,
                })}
                <span aria-hidden>→</span>
              </Link>
            )}
            {data.newLeadsCount > 0 && (
              <Link
                href="/leads?status=NEW"
                className="inline-flex items-center gap-2 rounded-full bg-[var(--brand-soft)] text-[var(--brand-strong)] px-3.5 py-1.5 text-sm font-medium transition-opacity hover:opacity-80"
              >
                <Inbox className="w-4 h-4" />
                {t("dashboard.newLeads", { count: data.newLeadsCount })}
                <span aria-hidden>→</span>
              </Link>
            )}
            {atRiskCount > 0 && (
              <Link
                href="/retention"
                className="inline-flex items-center gap-2 rounded-full bg-red-50 text-[var(--signal-danger)] px-3.5 py-1.5 text-sm font-medium transition-opacity hover:opacity-80"
              >
                <HeartPulse className="w-4 h-4" />
                {t("dashboard.atRisk", { count: atRiskCount })}
                <span aria-hidden>→</span>
              </Link>
            )}
          </div>
        )}

        {/* TIER 2 — hero band. The two numbers that matter; Z-start = check-ins top-left. */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="card p-5 flex flex-col">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                {t("dashboard.todayCheckins")}
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                <span className="pulse-dot" />
                {t("dashboard.live")}
              </span>
            </div>
            <div className="mt-2 flex-1 flex items-end">
              {data.todayCheckIns > 0 ? (
                <div className="text-5xl font-semibold tracking-tight leading-none">
                  {data.todayCheckIns}
                </div>
              ) : (
                <div className="text-lg text-[var(--muted)] py-3">{t("dashboard.noCheckinsYet")}</div>
              )}
            </div>
            <Link
              href="/scan"
              className="mt-4 inline-flex items-center gap-1 text-sm text-[var(--brand-strong)] transition-all hover:gap-2"
            >
              {t("dashboard.goToScanner")} <span aria-hidden>→</span>
            </Link>
          </div>

          <div className="card p-5 flex flex-col">
            <span className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
              {t("dashboard.monthRevenue")}
            </span>
            <div className="mt-2 flex-1 flex flex-col justify-center">
              <MonthlyGoalProgress
                variant="hero"
                goal={data.monthlyGoal}
                current={data.monthRevenue}
              />
            </div>
          </div>
        </section>

        {/* TIER 3 — secondary stat strip. Neutral by default; color only on abnormal data. */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniStat label={t("dashboard.activeMembers")} value={String(data.activeCount)} icon={Users} signal="neutral" />
          <MiniStat
            label={t("dashboard.overdue")}
            value={String(data.overdueCount)}
            icon={AlertTriangle}
            signal={data.overdueCount > 0 ? "danger" : "neutral"}
            href={data.overdueCount > 0 ? "/payments?filter=unpaid" : undefined}
          />
          <MiniStat
            label={t("dashboard.expiringThisWeek")}
            value={String(data.expiringCount)}
            icon={CalendarClock}
            signal={data.expiringCount > 0 ? "warn" : "neutral"}
          />
          <MiniStat
            label={t("dashboard.churn")}
            value={`${data.churnRate.toFixed(1)}%`}
            icon={TrendingDown}
            signal={churnSignal}
            sub={t("dashboard.churnSub", { cancelled: data.cancelledThisMonth, active: data.activeAtMonthStart })}
          />
        </section>

        {/* TIER 4 — detail. The quietest zone: trend, then the two action lists. */}
        <section className="card p-5">
          <RevenueChart data={data.revenueByMonth} />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">{t("dashboard.overdueMembers")}</h2>
              <span
                className={`text-xs ${
                  data.overdueCount > 0 ? "text-[var(--signal-danger)]" : "text-[var(--muted)]"
                }`}
              >
                {t("units.people", { count: data.overdueCount })}
              </span>
            </div>
            {data.overdueMembers.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">{t("dashboard.noOverdue")}</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {data.overdueMembers.slice(0, 5).map((p) => {
                  const url = waReminderUrl(user.gym, p.member, p.period, formatAZN(p.amount));
                  return (
                    <li key={p.id} className="py-2.5 flex items-center justify-between gap-2">
                      <Link href={`/members/${p.member.id}`} className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{p.member.name}</div>
                        <div className="text-[11px] text-[var(--muted)]">
                          {p.period} · {formatAZN(p.amount)}
                        </div>
                      </Link>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-3 py-1 shrink-0"
                      >
                        {t("common.whatsapp")}
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
            {data.overdueCount > 0 && (
              <Link href="/reminders" className="block text-center btn-brand mt-3">
                {t("dashboard.bulkReminder")}
              </Link>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">{t("dashboard.expiringTitle")}</h2>
              <span
                className={`text-xs ${
                  data.expiringCount > 0 ? "text-[var(--signal-warn)]" : "text-[var(--muted)]"
                }`}
              >
                {t("units.people", { count: data.expiringCount })}
              </span>
            </div>
            {data.expiringMembers.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">{t("dashboard.noExpiring")}</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
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
                          <div className="text-sm font-medium">{m.name}</div>
                          <div className="text-[11px] text-[var(--muted)]">
                            {m.publicId} · {fmtDate(m.expiryDate)}
                          </div>
                        </div>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            urgent
                              ? "text-[var(--signal-warn)] bg-amber-50"
                              : "text-[var(--muted)] bg-slate-100"
                          }`}
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
        </section>
      </div>
    </AppShell>
  );
}

type Signal = "neutral" | "danger" | "warn";

function MiniStat(props: {
  label: string;
  value: string;
  icon: typeof Users;
  signal: Signal;
  sub?: string;
  href?: string;
}) {
  const valueColor =
    props.signal === "danger"
      ? "text-[var(--signal-danger)]"
      : props.signal === "warn"
        ? "text-[var(--signal-warn)]"
        : "text-[var(--foreground)]";
  const Icon = props.icon;
  const body = (
    <div className="card p-3.5 h-full">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[var(--muted)]">
        <Icon className="w-3.5 h-3.5" />
        <span className="truncate">{props.label}</span>
      </div>
      <div className={`mt-1 text-xl font-semibold ${valueColor}`}>{props.value}</div>
      {props.sub && <div className="text-[11px] text-[var(--muted)]">{props.sub}</div>}
    </div>
  );
  if (props.href) {
    return (
      <Link href={props.href} className="block hover:-translate-y-0.5 transition-transform">
        {body}
      </Link>
    );
  }
  return body;
}
