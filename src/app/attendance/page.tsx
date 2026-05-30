import Link from "next/link";
import { Activity, Clock, CalendarDays, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { requireOwner } from "@/lib/dal";
import { getAttendanceHeatmap } from "@/lib/attendance";
import { Heatmap } from "@/components/heatmap";

const TABS: { value: string; label: string; days: 7 | 30 | 90 }[] = [
  { value: "7", label: "7 gün", days: 7 },
  { value: "30", label: "30 gün", days: 30 },
  { value: "90", label: "90 gün", days: 90 },
];

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await requireOwner();
  const { range } = await searchParams;
  const tab = TABS.find((t) => t.value === range) ?? TABS[1];

  const data = await getAttendanceHeatmap(user.gymId, tab.days);

  return (
    <AppShell>
      <PageHeader
        title="Davamiyyət"
        subtitle="Hansı gün və saatlarda zalınız ən sıxdır"
        icon={Activity}
        tone="dark"
        tabs={
          <nav className="flex gap-1 -mb-px text-sm">
            {TABS.map((t) => (
              <Link
                key={t.value}
                href={`/attendance?range=${t.value}`}
                className={`px-4 py-2.5 border-b-2 -mb-px transition-colors ${tab.value === t.value
                  ? "border-[var(--brand)] text-white"
                  : "border-transparent text-white/60 hover:text-white"
                  }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        }
      />

      <div className="px-4 lg:px-8 py-6 space-y-4">
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard
            label="Cəmi giriş"
            value={String(data.total)}
            icon={Users}
          />
          <StatCard
            label="Ən sıx gün"
            value={data.peakDay ? `${data.peakDay.label} (${data.peakDay.count})` : "—"}
            icon={CalendarDays}
          />
          <StatCard
            label="Ən sıx saat"
            value={
              data.peakHour
                ? `${data.peakHour.hour.toString().padStart(2, "0")}:00 (${data.peakHour.count})`
                : "—"
            }
            icon={Clock}
          />
        </section>

        <section className="card p-5">
          <h2 className="font-medium mb-3">İstilik xəritəsi</h2>
          {data.total === 0 ? (
            <p className="text-sm text-[var(--muted)] py-8 text-center">
              Bu dövrdə heç bir giriş qeydə alınmayıb.
            </p>
          ) : (
            <Heatmap data={data} />
          )}
        </section>
      </div>
    </AppShell>
  );
}

function StatCard(props: { label: string; value: string; icon: typeof Users }) {
  const Icon = props.icon;
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
            {props.label}
          </div>
          <div className="text-lg font-semibold mt-1 truncate">{props.value}</div>
        </div>
        <div className="w-9 h-9 rounded-lg bg-[var(--brand-soft)] text-[var(--brand-strong)] flex items-center justify-center">
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
}
