import Link from "next/link";
import { HeartPulse, UserMinus, CalendarX } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getOwnerDb } from "@/lib/dal";
import {
  getRetentionData,
  winBackMessage,
  type MemberAtRisk,
  type RetentionKind,
} from "@/lib/retention";
import { buildWaUrl } from "@/lib/templates";

export default async function RetentionPage() {
  const { user } = await getOwnerDb();
  const { ghosters, lapsers } = await getRetentionData(user.gymId);
  const total = ghosters.length + lapsers.length;

  return (
    <AppShell>
      <PageHeader
        title="Geri qaytarma"
        subtitle={`${total} üzv risk altında`}
        icon={HeartPulse}
        tone="dark"
      />

      <div className="px-4 lg:px-8 py-6 space-y-6">
        <RiskSection
          title="Gəlmir"
          hint="Aktiv, amma 14 gündür gəlməyən üzvlər"
          icon={UserMinus}
          kind="ghoster"
          members={ghosters}
          emptyText="Bütün aktiv üzvlər müntəzəm gəlir 🎉"
        />
        <RiskSection
          title="Üzvlüyü bitib"
          hint="Son 60 gündə üzvlüyü bitmiş və ya ləğv edilmiş üzvlər"
          icon={CalendarX}
          kind="lapser"
          members={lapsers}
          emptyText="Yaxınlarda üzvlüyü bitən yoxdur 🎉"
        />
      </div>
    </AppShell>
  );
}

function RiskSection({
  title,
  hint,
  icon: Icon,
  kind,
  members,
  emptyText,
}: {
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
        <span className="text-xs text-[var(--muted)]">{members.length} nəfər</span>
      </div>
      <p className="text-xs text-[var(--muted)] mb-3">{hint}</p>

      {members.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {members.map((m) => (
            <RiskRow key={m.id} member={m} kind={kind} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RiskRow({ member, kind }: { member: MemberAtRisk; kind: RetentionKind }) {
  const badge =
    member.daysSince === null
      ? "Heç gəlməyib"
      : kind === "ghoster"
        ? `${member.daysSince} gündür gəlmir`
        : `${member.daysSince} gün öncə bitib`;

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
            {member.publicId} · {member.phone || "telefon yoxdur"}
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
            WhatsApp
          </a>
        )}
      </div>
    </li>
  );
}
