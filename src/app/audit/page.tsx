import { ScrollText } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getOwnerDb } from "@/lib/dal";
import { getT } from "@/lib/i18n-server";
import {
  AUDIT_ACTION_LABEL,
  summarizeAudit,
  entityHref,
  auditCategory,
  type AuditPayload,
} from "@/lib/audit";
import { AuditLog, type AuditRow } from "@/components/audit-log";

// Deterministic UTC timestamp (avoids SSR/client locale mismatch).
function fmtDateTime(d: Date) {
  return d.toISOString().replace("T", " ").slice(0, 16);
}

export default async function AuditPage() {
  const { db } = await getOwnerDb();
  const t = await getT();

  const entries = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { select: { name: true, email: true } } },
  });

  const rows: AuditRow[] = entries.map((e) => {
    const payload = e.payload as AuditPayload;
    const summary = summarizeAudit(payload);
    return {
      id: e.id,
      action: AUDIT_ACTION_LABEL[e.action] ?? e.action,
      time: fmtDateTime(e.createdAt),
      actor: e.actor?.name ?? t("audit.actorSystem"),
      category: auditCategory(e.action),
      detail: summary || undefined,
      href: entityHref(e.entityType, e.entityId, payload),
    };
  });

  return (
    <AppShell>
      <PageHeader
        title={t("audit.title")}
        subtitle={t("audit.subtitle")}
        icon={ScrollText}
        tone="dark"
      />
      <div className="dash min-h-full px-4 lg:px-7 py-6 space-y-[18px]">
        <AuditLog rows={rows} />
      </div>
    </AppShell>
  );
}
