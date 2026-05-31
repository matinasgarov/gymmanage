import Link from "next/link";
import { LayoutDashboard, Users, AlertTriangle, CalendarClock, ScanLine, TrendingUp, PieChart, TrendingDown, Inbox, HeartPulse } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/dal";
import { getDashboard, waReminderUrl } from "@/lib/dashboard";
import { formatAZN } from "@/lib/members";
import { RevenueChart } from "@/components/revenue-chart";

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function daysUntil(d: Date) {
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const data = await getDashboard(user.gymId);

  return (
    <AppShell>
      <PageHeader
        title="Panel"
        subtitle={user.gym.name}
        icon={LayoutDashboard}
        tone="dark"
        actions={
          <Link href="/members/new" className="btn-brand hidden sm:inline-flex items-center gap-2">
            <span>+ Yeni üzv</span>
          </Link>
        }
      />

      <div className="px-4 lg:px-8 py-6 space-y-6">
        {data.newLeadsCount > 0 && (
          <Link
            href="/leads?status=NEW"
            className="card p-4 flex items-center gap-3 hover:bg-[var(--brand-soft)]/40 border-[var(--brand)]/40 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-[var(--brand-soft)] text-[var(--brand-strong)] flex items-center justify-center">
              <Inbox className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">
                {data.newLeadsCount} yeni müraciət
              </div>
              <div className="text-xs text-[var(--muted)]">
                Sizinlə əlaqə saxlanmasını gözləyirlər.
              </div>
            </div>
            <span className="text-[var(--brand-strong)] text-sm">→</span>
          </Link>
        )}

        {data.atRisk.ghosters + data.atRisk.lapsers > 0 && (
          <Link
            href="/retention"
            className="card p-4 flex items-center gap-3 hover:bg-[var(--brand-soft)]/40 border-[var(--brand)]/40 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-[var(--brand-soft)] text-[var(--brand-strong)] flex items-center justify-center">
              <HeartPulse className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">
                {data.atRisk.ghosters + data.atRisk.lapsers} üzv risk altında
              </div>
              <div className="text-xs text-[var(--muted)] truncate">
                {data.atRisk.sample.length > 0
                  ? data.atRisk.sample.join(", ")
                  : "Gəlməyən və üzvlüyü bitən üzvlər"}
              </div>
            </div>
            <span className="text-[var(--brand-strong)] text-sm">→</span>
          </Link>
        )}

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Aktiv üzvlər"
            value={String(data.activeCount)}
            icon={Users}
            accent="brand"
          />
          <StatCard
            label="Borclu"
            value={String(data.overdueCount)}
            icon={AlertTriangle}
            accent="danger"
            href={data.overdueCount > 0 ? "/payments?filter=unpaid" : undefined}
          />
          <StatCard
            label="Bu həftə bitir"
            value={String(data.expiringCount)}
            icon={CalendarClock}
            accent="warn"
          />
          <StatCard
            label="Bu gün giriş"
            value={String(data.todayCheckIns)}
            icon={ScanLine}
            accent="brand"
          />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[var(--brand-strong)]" />
                <h2 className="font-medium">6 aylıq gəlir</h2>
              </div>
              <span className="text-lg font-semibold">{formatAZN(data.monthRevenue)}</span>
            </div>
            <RevenueChart data={data.revenueByMonth} />
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">Borclu üzvlər</h2>
              <span className="text-xs text-[var(--muted)]">{data.overdueCount} nəfər</span>
            </div>
            {data.overdueMembers.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Borclu yoxdur 🎉</p>
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
                        WhatsApp
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
            {data.overdueCount > 0 && (
              <Link
                href="/reminders"
                className="block text-center btn-brand mt-3"
              >
                Toplu xatırlatma →
              </Link>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <PieChart className="w-4 h-4 text-[var(--brand-strong)]" />
              <h2 className="font-medium">Bu ay plan üzrə gəlir</h2>
            </div>
            {data.revenueByPlan.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Bu ay ödəniş qeydə alınmayıb.</p>
            ) : (
              <PlanRevenueBars rows={data.revenueByPlan} total={data.monthRevenue} />
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <h2 className="font-medium">Churn (bu ay)</h2>
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-semibold">
                {data.churnRate.toFixed(1)}%
              </div>
              <div className="text-xs text-[var(--muted)]">
                {data.cancelledThisMonth} / {data.activeAtMonthStart} üzv
              </div>
            </div>
            <p className="text-xs text-[var(--muted)] mt-2">
              Ay başında aktiv olan üzvlərdən neçəsi ləğv edib.
            </p>
            <ChurnSeverity rate={data.churnRate} />
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">Bu həftə üzvlüyü bitir</h2>
            <span className="text-xs text-[var(--muted)]">{data.expiringCount} nəfər</span>
          </div>
          {data.expiringMembers.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Bu həftə bitən üzvlük yoxdur.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {data.expiringMembers.map((m) => (
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
                    <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                      {daysUntil(m.expiryDate)} gün
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function PlanRevenueBars({
  rows,
  total,
}: {
  rows: { plan: string; label: string; total: number }[];
  total: number;
}) {
  const colors: Record<string, string> = {
    MONTHLY: "bg-teal-500",
    QUARTERLY: "bg-indigo-500",
    ANNUAL: "bg-amber-500",
    VISITOR: "bg-emerald-500",
  };
  const safe = total || 1;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const pct = Math.min(100, (r.total / safe) * 100);
        return (
          <li key={r.plan}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium">{r.label}</span>
              <span className="text-[var(--muted)]">
                {r.total.toFixed(2)} ₼ · {pct.toFixed(0)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full ${colors[r.plan] ?? "bg-slate-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ChurnSeverity({ rate }: { rate: number }) {
  let label = "Sağlam";
  let cls = "text-emerald-700 bg-emerald-100";
  if (rate >= 10) {
    label = "Yüksək — diqqət lazımdır";
    cls = "text-red-700 bg-red-100";
  } else if (rate >= 5) {
    label = "Orta";
    cls = "text-amber-700 bg-amber-100";
  }
  return (
    <span className={`inline-block mt-3 text-[11px] px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  );
}

function StatCard(props: {
  label: string;
  value: string;
  icon: typeof Users;
  accent: "brand" | "danger" | "warn";
  href?: string;
}) {
  const palettes = {
    brand: "bg-[var(--brand-soft)] text-[var(--brand-strong)]",
    danger: "bg-red-100 text-red-600",
    warn: "bg-amber-100 text-amber-600",
  };
  const Icon = props.icon;
  const body = (
    <div className="card p-4 h-full">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
            {props.label}
          </div>
          <div className="text-2xl font-semibold mt-1">{props.value}</div>
        </div>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${palettes[props.accent]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
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
