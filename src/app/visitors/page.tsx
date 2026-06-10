import { UserCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getOwnerDb } from "@/lib/dal";
import { getT } from "@/lib/i18n-server";
import { formatAZN } from "@/lib/members";

function fmtDateTime(d: Date) {
  return d.toISOString().replace("T", " ").slice(0, 16);
}

export default async function VisitorsPage() {
  const { db } = await getOwnerDb();
  const t = await getT();

  const passes = await db.visitorPass.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      _count: { select: { checkIns: true } },
    },
  });

  return (
    <AppShell>
      <PageHeader
        title={t("visitors.title")}
        subtitle={t("visitors.subtitle")}
        icon={UserCheck}
        tone="dark"
      />
      <div className="px-4 lg:px-8 py-6">
        {passes.length === 0 ? (
          <div className="card p-10 text-center">
            <UserCheck className="w-8 h-8 text-[var(--muted)] mx-auto mb-2" />
            <p className="text-sm text-[var(--muted)]">{t("visitors.noVisitors")}</p>
          </div>
        ) : (
          <div className="card divide-y divide-[var(--border)]">
            {passes.map((p) => {
              const isDayPass = p.token !== null;
              const expired = p.expiresAt.getTime() < Date.now();
              return (
                <div
                  key={p.id}
                  className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {p.name ?? t("visitors.anonymous")}
                      </span>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full ${
                          isDayPass
                            ? "bg-sky-100 text-sky-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {isDayPass ? t("visitors.typeDayPass") : t("visitors.typeQuickEntry")}
                      </span>
                      {isDayPass && expired && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                          {t("visitors.expired")}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--muted)] mt-0.5">
                      {fmtDateTime(p.createdAt)} · {t(`method.${p.method}`)}
                      {p.phone ? ` · ${p.phone}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-[var(--muted)]">
                      {t("units.entries", { count: p._count.checkIns })}
                    </span>
                    <span className="text-sm font-medium">{formatAZN(p.amount)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
