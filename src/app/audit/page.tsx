import Link from "next/link";
import { ScrollText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getOwnerDb } from "@/lib/dal";
import { getT } from "@/lib/i18n-server";
import { AUDIT_ACTION_LABEL, summarizeAudit, entityHref, type AuditPayload } from "@/lib/audit";

function fmtDateTime(d: Date) {
  return d.toISOString().replace("T", " ").slice(0, 16);
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { db } = await getOwnerDb();
  const t = await getT();

  const ACTION_FILTERS: { value: string; labelKey: string }[] = [
    { value: "", labelKey: "audit.filterAll" },
    { value: "payment.", labelKey: "audit.filterPayments" },
    { value: "member.", labelKey: "audit.filterMembers" },
    { value: "checkin.", labelKey: "audit.filterCheckins" },
  ];

  const { filter } = await searchParams;
  const activePrefix = filter ?? "";

  const entries = await db.auditLog.findMany({
    where: {
      ...(activePrefix ? { action: { startsWith: activePrefix } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { name: true, email: true } } },
  });

  return (
    <AppShell>
      <PageHeader
        title={t("audit.title")}
        subtitle={t("audit.subtitle")}
        icon={ScrollText}
        tone="dark"
        tabs={
          <nav className="flex gap-1 -mb-px text-sm">
            {ACTION_FILTERS.map((f) => (
              <Link
                key={f.value}
                href={f.value ? `/audit?filter=${encodeURIComponent(f.value)}` : "/audit"}
                className={`px-4 py-2.5 border-b-2 -mb-px transition-colors ${
                  activePrefix === f.value
                    ? "border-[var(--brand)] text-white"
                    : "border-transparent text-white/60 hover:text-white"
                }`}
              >
                {t(f.labelKey)}
              </Link>
            ))}
          </nav>
        }
      />

      <div className="px-4 lg:px-8 py-6">
        {entries.length === 0 ? (
          <div className="card p-10 text-center">
            <ScrollText className="w-8 h-8 text-[var(--muted)] mx-auto mb-2" />
            <p className="text-sm text-[var(--muted)]">{t("audit.noEntries")}</p>
          </div>
        ) : (
          <div className="card divide-y divide-[var(--border)]">
            {entries.map((e) => {
              const label = AUDIT_ACTION_LABEL[e.action] ?? e.action;
              const summary = summarizeAudit(e.payload as AuditPayload);
              const href = entityHref(e.entityType, e.entityId, e.payload as AuditPayload);
              const inner = (
                <div className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-[11px] text-[var(--muted)]">
                      {fmtDateTime(e.createdAt)} · {e.actor?.name ?? t("audit.actorSystem")}
                      {summary ? ` · ${summary}` : ""}
                    </div>
                  </div>
                  <span className="text-[10px] text-[var(--muted)] shrink-0 uppercase tracking-wider">
                    {e.entityType}
                  </span>
                </div>
              );
              return href ? (
                <Link key={e.id} href={href} className="block hover:bg-[var(--background)]">
                  {inner}
                </Link>
              ) : (
                <div key={e.id}>{inner}</div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
