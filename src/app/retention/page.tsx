import Link from "next/link";
import { HeartPulse, UserMinus, CalendarX } from "lucide-react";
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

      <div className="px-4 lg:px-8 py-6 space-y-6">
        <RiskSection
          t={t}
          title={t("retention.ghostersTitle")}
          hint={t("retention.ghostersHint")}
          icon={UserMinus}
          kind="ghoster"
          members={ghosters}
          emptyText={t("retention.ghostersEmpty")}
        />
        <RiskSection
          t={t}
          title={t("retention.lapsersTitle")}
          hint={t("retention.lapsersHint")}
          icon={CalendarX}
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
  kind,
  members,
  emptyText,
}: {
  t: TFunction;
  title: string;
  hint: string;
  icon: typeof UserMinus;
  kind: RetentionKind;
  members: MemberAtRisk[];
  emptyText: string;
}) {
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-[var(--brand-strong)]" />
          <h2 className="font-medium">{title}</h2>
        </div>
        <span className="text-xs text-[var(--muted)]">{t("units.people", { count: members.length })}</span>
      </div>
      <p className="text-xs text-[var(--muted)] mb-3">{hint}</p>

      {members.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {members.map((m) => (
            <RiskRow key={m.id} t={t} member={m} kind={kind} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RiskRow({ t, member, kind }: { t: TFunction; member: MemberAtRisk; kind: RetentionKind }) {
  const badge =
    member.daysSince === null
      ? t("retention.neverVisited")
      : kind === "ghoster"
        ? t("retention.absentDays", { count: member.daysSince })
        : t("retention.expiredDaysAgo", { count: member.daysSince });

  const hasPhone = member.phone.trim().length > 0;
  const waUrl = hasPhone ? buildWaUrl(member.phone, winBackMessage(member, kind)) : null;

  return (
    <li className="py-2.5 flex items-center justify-between gap-2">
      <Link href={`/members/${member.id}`} className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-9 h-9 rounded-full bg-[var(--brand-soft)] text-[var(--brand-strong)] flex items-center justify-center text-sm font-semibold shrink-0 overflow-hidden">
          {member.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.photoUrl} alt={member.name} className="w-full h-full object-cover" />
          ) : (
            member.name.slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{member.name}</div>
          <div className="text-[11px] text-[var(--muted)]">
            {member.publicId} · {member.phone || t("retention.noPhone")}
          </div>
        </div>
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full hidden sm:inline">
          {badge}
        </span>
        {waUrl && (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-3 py-1"
          >
            {t("common.whatsapp")}
          </a>
        )}
      </div>
    </li>
  );
}
