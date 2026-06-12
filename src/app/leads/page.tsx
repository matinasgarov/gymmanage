import Link from "next/link";
import { Inbox, PhoneCall, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getOwnerDb } from "@/lib/dal";
import { getT } from "@/lib/i18n-server";
import { LeadRowActions } from "@/components/lead-row-actions";

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  NEW: { bg: "rgba(245,158,11,.12)", color: "#f59e0b" },
  CONTACTED: { bg: "rgba(6,182,212,.15)", color: "#06b6d4" },
  CONVERTED: { bg: "rgba(16,185,129,.12)", color: "#10b981" },
  LOST: { bg: "var(--d-bg)", color: "var(--d-tx3)" },
};

function fmtDateTime(d: Date) {
  return d.toISOString().replace("T", " ").slice(0, 16);
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { user, db } = await getOwnerDb();
  const t = await getT();

  const TABS: { value: string; labelKey: string }[] = [
    { value: "", labelKey: "leads.tabAll" },
    { value: "NEW", labelKey: "leads.tabNew" },
    { value: "CONTACTED", labelKey: "leads.tabContacted" },
    { value: "CONVERTED", labelKey: "leads.tabConverted" },
    { value: "LOST", labelKey: "leads.tabLost" },
  ];

  const { status } = await searchParams;
  const active = status ?? "";

  const leads = await db.lead.findMany({
    where: {
      ...(active && active !== ""
        ? { status: active as "NEW" | "CONTACTED" | "CONVERTED" | "LOST" }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const publicUrl = `/join/${user.gymId}`;

  return (
    <AppShell>
      <PageHeader
        title={t("leads.title")}
        subtitle={t("leads.subtitle")}
        icon={Inbox}
        tone="dark"
        tabs={
          <nav className="flex gap-1 -mb-px text-sm overflow-x-auto">
            {TABS.map((tab) => (
              <Link
                key={tab.value}
                href={tab.value ? `/leads?status=${tab.value}` : "/leads"}
                className={`px-4 py-2.5 border-b-2 -mb-px shrink-0 transition-colors ${
                  active === tab.value
                    ? "border-white text-white font-semibold"
                    : "border-transparent text-white/55 hover:text-white"
                }`}
              >
                {t(tab.labelKey)}
              </Link>
            ))}
          </nav>
        }
      />

      <div className="dash min-h-full px-4 lg:px-7 py-6" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Public registration link card */}
        <div
          style={{ background: "white", borderRadius: 16, boxShadow: "var(--d-sh1)", padding: "16px 20px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--d-tx)" }}>{t("leads.registerLink")}</div>
            <div style={{ fontSize: 11.5, color: "var(--d-tx3)", fontWeight: 500, marginTop: 2 }}>{t("leads.shareHint")}</div>
            <code style={{ display: "block", fontSize: 12, color: "#3b7bf6", marginTop: 4, wordBreak: "break-all" }}>
              {publicUrl}
            </code>
          </div>
          <Link href={publicUrl} target="_blank" className="dash-scan-btn">
            <ExternalLink style={{ width: 14, height: 14 }} /> {t("leads.openLink")}
          </Link>
        </div>

        {leads.length === 0 ? (
          <div style={{ background: "white", borderRadius: 16, boxShadow: "var(--d-sh1)", padding: "48px 20px", textAlign: "center" }}>
            <Inbox style={{ width: 32, height: 32, color: "var(--d-tx3)", margin: "0 auto 10px" }} />
            <p style={{ fontSize: 13, color: "var(--d-tx3)", fontWeight: 600 }}>
              {active ? t("leads.noLeadsFiltered") : t("leads.noLeads")}
            </p>
          </div>
        ) : (
          <div style={{ background: "white", borderRadius: 16, boxShadow: "var(--d-sh1)", overflow: "hidden", padding: "6px 20px" }}>
            {leads.map((l, i) => {
              const badge = STATUS_BADGE[l.status];
              return (
                <div
                  key={l.id}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "14px 0",
                    borderBottom: i < leads.length - 1 ? "1px solid var(--d-bdr)" : "none",
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--d-tx)" }}>{l.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 6, background: badge.bg, color: badge.color }}>
                        {t(`leadStatus.${l.status}`)}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--d-tx3)", fontWeight: 500, marginTop: 3 }}>
                      <a href={`tel:${l.phone}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--d-tx3)", textDecoration: "none" }}>
                        <PhoneCall style={{ width: 12, height: 12 }} />
                        {l.phone}
                      </a>
                      {l.interest && <> · {t(`plan.${l.interest}`)}</>}
                      {" · "}
                      {fmtDateTime(l.createdAt)}
                    </div>
                    {l.message && (
                      <div style={{ fontSize: 12, color: "var(--d-tx2)", marginTop: 6, fontStyle: "italic" }}>
                        &ldquo;{l.message}&rdquo;
                      </div>
                    )}
                  </div>
                  <LeadRowActions
                    leadId={l.id}
                    status={l.status}
                    convertedMemberId={l.convertedMemberId}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
