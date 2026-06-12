import Link from "next/link";
import { HeartPulse, UserMinus, CalendarX, Mail, type LucideIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getOwnerDb } from "@/lib/dal";
import { getT } from "@/lib/i18n-server";
import {
  getRetentionData,
  winBackMessage,
  type MemberAtRisk,
  type RetentionKind,
} from "@/lib/retention";
import { buildWaUrl } from "@/lib/templates";
import type { TFunction } from "@/lib/i18n";

export default async function RetentionPage() {
  const [{ user }, t] = await Promise.all([getOwnerDb(), getT()]);
  const { ghosters, lapsers } = await getRetentionData(user.gymId);
  const total = ghosters.length + lapsers.length;

  return (
    <AppShell>
      <PageHeader
        title={t("retention.title")}
        subtitle={t("retention.subtitle", { count: total })}
        icon={HeartPulse}
        tone="dark"
      />

      <div className="dash min-h-full px-4 lg:px-7 py-6" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <RiskSection
          t={t}
          title={t("retention.ghostersTitle")}
          hint={t("retention.ghostersHint")}
          icon={UserMinus}
          iconColor="#06b6d4"
          iconBg="rgba(6,182,212,.15)"
          kind="ghoster"
          members={ghosters}
          emptyText={t("retention.ghostersEmpty")}
        />
        <RiskSection
          t={t}
          title={t("retention.lapsersTitle")}
          hint={t("retention.lapsersHint")}
          icon={CalendarX}
          iconColor="#f59e0b"
          iconBg="rgba(245,158,11,.12)"
          kind="lapser"
          members={lapsers}
          emptyText={t("retention.lapsersEmpty")}
        />
      </div>
    </AppShell>
  );
}

function RiskSection({
  t,
  title,
  hint,
  icon: Icon,
  iconColor,
  iconBg,
  kind,
  members,
  emptyText,
}: {
  t: TFunction;
  title: string;
  hint: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  kind: RetentionKind;
  members: MemberAtRisk[];
  emptyText: string;
}) {
  return (
    <div style={{ background: "white", borderRadius: 16, boxShadow: "var(--d-sh1)", overflow: "hidden" }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, padding: "20px 24px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: iconBg, color: iconColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon style={{ width: 16, height: 16 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: "var(--d-tx)", letterSpacing: "-0.3px" }}>{title}</span>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--d-tx3)" }}>{hint}</span>
          </div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--d-tx3)", whiteSpace: "nowrap", paddingTop: 2 }}>
          <b style={{ color: "var(--d-tx)" }}>{members.length}</b> {t("reminders.persons")}
        </span>
      </div>

      {/* Section body */}
      <div style={{ padding: "14px 24px 20px" }}>
        {members.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--d-tx3)", padding: "6px 0 2px" }}>
            {emptyText}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {members.map((m, i) => (
              <RiskRow key={m.id} t={t} member={m} kind={kind} last={i === members.length - 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RiskRow({
  t,
  member,
  kind,
  last,
}: {
  t: TFunction;
  member: MemberAtRisk;
  kind: RetentionKind;
  last: boolean;
}) {
  const badge =
    member.daysSince === null
      ? t("retention.neverVisited")
      : kind === "ghoster"
        ? t("retention.absentDays", { count: member.daysSince })
        : t("retention.expiredDaysAgo", { count: member.daysSince });

  // never-visited is most severe (red); absent ghosters warn (amber); lapsers muted (gray)
  const badgeStyle =
    member.daysSince === null
      ? { background: "rgba(239,68,68,.1)", color: "#ef4444" }
      : kind === "ghoster"
        ? { background: "rgba(245,158,11,.12)", color: "#f59e0b" }
        : { background: "var(--d-bg)", color: "var(--d-tx3)" };

  const hasPhone = member.phone.trim().length > 0;
  const waUrl = hasPhone ? buildWaUrl(member.phone, winBackMessage(member, kind)) : null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderBottom: last ? "none" : "1px solid var(--d-bdr)",
      }}
    >
      {/* Avatar */}
      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(59,123,246,.12)", color: "#3b7bf6", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
        {member.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={member.photoUrl} alt={member.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          member.name.slice(0, 1).toUpperCase()
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <Link
          href={`/members/${member.id}`}
          style={{ fontSize: 13.5, fontWeight: 700, color: "var(--d-tx)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: "none" }}
        >
          {member.name}
        </Link>
        <div style={{ fontSize: 11.5, color: "var(--d-tx3)", fontWeight: 500 }}>
          {member.publicId} · {member.phone || t("retention.noPhone")}
        </div>
      </div>

      {/* Badge */}
      <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 6, whiteSpace: "nowrap", flexShrink: 0, ...badgeStyle }}>
        {badge}
      </span>

      {/* WhatsApp button */}
      {waUrl && (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={t("common.whatsapp")}
          className="reminder-wa-btn"
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            border: "1px solid var(--d-bdr)",
            background: "var(--d-bg)",
            color: "var(--d-tx3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            textDecoration: "none",
            transition: "background .15s, color .15s, border-color .15s",
          }}
        >
          <Mail style={{ width: 13, height: 13 }} />
        </a>
      )}
    </div>
  );
}
