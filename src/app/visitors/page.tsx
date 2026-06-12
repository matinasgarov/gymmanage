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
  const nowMs = new Date().getTime();

  return (
    <AppShell>
      <PageHeader
        title={t("visitors.title")}
        subtitle={t("visitors.subtitle")}
        icon={UserCheck}
        tone="dark"
      />
      <div className="dash min-h-full px-4 lg:px-7 py-6">
        {passes.length === 0 ? (
          <div style={{ background: "white", borderRadius: 16, boxShadow: "var(--d-sh1)", padding: "48px 20px", textAlign: "center" }}>
            <UserCheck style={{ width: 32, height: 32, color: "var(--d-tx3)", margin: "0 auto 10px" }} />
            <p style={{ fontSize: 13, color: "var(--d-tx3)", fontWeight: 600 }}>{t("visitors.noVisitors")}</p>
          </div>
        ) : (
          <div style={{ background: "white", borderRadius: 16, boxShadow: "var(--d-sh1)", overflow: "hidden", padding: "6px 20px" }}>
            {passes.map((p, i) => {
              const isDayPass = p.token !== null;
              const expired = p.expiresAt.getTime() < nowMs;
              const typeBadge = isDayPass
                ? { bg: "rgba(6,182,212,.15)", color: "#06b6d4" }
                : { bg: "rgba(16,185,129,.12)", color: "#10b981" };
              return (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "14px 0",
                    borderBottom: i < passes.length - 1 ? "1px solid var(--d-bdr)" : "none",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--d-tx)" }}>
                        {p.name ?? t("visitors.anonymous")}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 6, background: typeBadge.bg, color: typeBadge.color }}>
                        {isDayPass ? t("visitors.typeDayPass") : t("visitors.typeQuickEntry")}
                      </span>
                      {isDayPass && expired && (
                        <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 6, background: "var(--d-bg)", color: "var(--d-tx3)" }}>
                          {t("visitors.expired")}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--d-tx3)", fontWeight: 500, marginTop: 3 }}>
                      {fmtDateTime(p.createdAt)} · {t(`method.${p.method}`)}
                      {p.phone ? ` · ${p.phone}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, color: "var(--d-tx3)", fontWeight: 500 }}>
                      {t("units.entries", { count: p._count.checkIns })}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--d-tx)" }}>{formatAZN(p.amount)}</span>
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
