import Link from "next/link";
import { Inbox, PhoneCall, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getOwnerDb } from "@/lib/dal";
import { LeadRowActions } from "@/components/lead-row-actions";
import { PLAN_LABEL } from "@/config/gym-plans";

const STATUS_LABEL: Record<string, string> = {
  NEW: "Yeni",
  CONTACTED: "Əlaqə saxlanılıb",
  CONVERTED: "Üzv oldu",
  LOST: "İtirildi",
};
const STATUS_COLOR: Record<string, string> = {
  NEW: "bg-amber-100 text-amber-700",
  CONTACTED: "bg-sky-100 text-sky-700",
  CONVERTED: "bg-emerald-100 text-emerald-700",
  LOST: "bg-slate-200 text-slate-700",
};
function fmtDateTime(d: Date) {
  return d.toISOString().replace("T", " ").slice(0, 16);
}

const TABS: { value: string; label: string }[] = [
  { value: "", label: "Hamısı" },
  { value: "NEW", label: "Yeni" },
  { value: "CONTACTED", label: "Əlaqədə" },
  { value: "CONVERTED", label: "Üzv olub" },
  { value: "LOST", label: "İtirilib" },
];

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { user, db } = await getOwnerDb();
  const { status } = await searchParams;
  const active = status ?? "";

  const leads = await db.lead.findMany({
    where: {
      ...(active && active !== "" ? { status: active as "NEW" | "CONTACTED" | "CONVERTED" | "LOST" } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const publicUrl = `/join/${user.gymId}`;

  return (
    <AppShell>
      <PageHeader
        title="Müraciətlər"
        subtitle="Zalınıza üzv olmaq istəyənlər"
        icon={Inbox}
        tone="dark"
        tabs={
          <nav className="flex gap-1 -mb-px text-sm overflow-x-auto">
            {TABS.map((t) => (
              <Link
                key={t.value}
                href={t.value ? `/leads?status=${t.value}` : "/leads"}
                className={`px-4 py-2.5 border-b-2 -mb-px shrink-0 transition-colors ${active === t.value
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
        <div className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Açıq qeydiyyat linki</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              Bu linki Instagram bio və ya WhatsApp statusunda paylaşın.
            </div>
            <code className="block text-xs text-[var(--brand-strong)] mt-1 break-all">
              {publicUrl}
            </code>
          </div>
          <Link
            href={publicUrl}
            target="_blank"
            className="btn-ghost inline-flex items-center gap-1.5 shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Aç
          </Link>
        </div>

        {leads.length === 0 ? (
          <div className="card p-10 text-center">
            <Inbox className="w-8 h-8 text-[var(--muted)] mx-auto mb-2" />
            <p className="text-sm text-[var(--muted)]">
              {active ? "Bu kateqoriyada müraciət yoxdur." : "Hələ müraciət gəlməyib."}
            </p>
          </div>
        ) : (
          <div className="card divide-y divide-[var(--border)]">
            {leads.map((l) => (
              <div key={l.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{l.name}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_COLOR[l.status]}`}>
                      {STATUS_LABEL[l.status]}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--muted)] mt-0.5">
                    <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1 hover:underline">
                      <PhoneCall className="w-3 h-3" />
                      {l.phone}
                    </a>
                    {l.interest && (
                      <> · {PLAN_LABEL[l.interest]}</>
                    )}
                    {" · "}
                    {fmtDateTime(l.createdAt)}
                  </div>
                  {l.message && (
                    <div className="text-xs text-[var(--muted)] mt-1.5 italic">
                      “{l.message}”
                    </div>
                  )}
                </div>
                <LeadRowActions
                  leadId={l.id}
                  status={l.status}
                  convertedMemberId={l.convertedMemberId}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
