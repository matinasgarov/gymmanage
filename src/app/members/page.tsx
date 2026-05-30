import Link from "next/link";
import { Users, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getGymDb } from "@/lib/dal";
import { formatAZN } from "@/lib/members";
import { MEMBER_STATUS_LABEL as STATUS_LABEL, MEMBER_STATUS_COLOR as STATUS_COLOR } from "@/lib/labels";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { db } = await getGymDb();
  const { q } = await searchParams;
  const query = q?.trim();

  const members = await db.member.findMany({
    where: {
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { phone: { contains: query } },
              { publicId: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <AppShell>
      <PageHeader
        title="Üzvlər"
        subtitle={`${members.length} nəticə${query ? ` · "${query}"` : ""}`}
        icon={Users}
        tone="dark"
        actions={
          <Link href="/members/new" className="btn-brand inline-flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Yeni üzv</span>
          </Link>
        }
      />

      <div className="px-4 lg:px-8 py-6">
        <form className="card flex items-center gap-2 px-3 py-2 mb-4">
          <Search className="w-4 h-4 text-[var(--muted)] shrink-0" />
          <input
            name="q"
            defaultValue={query}
            placeholder="Ad, telefon və ya ID ilə axtarış…"
            className="flex-1 outline-none text-sm bg-transparent"
          />
          <button type="submit" className="text-xs text-[var(--brand-strong)] font-medium px-2">
            Axtar
          </button>
        </form>

        {members.length === 0 ? (
          <div className="card p-10 text-center">
            <Users className="w-8 h-8 text-[var(--muted)] mx-auto mb-2" />
            <p className="text-sm text-[var(--muted)] mb-3">
              {query ? "Nəticə tapılmadı." : "Hələ üzv əlavə edilməyib."}
            </p>
            {!query && (
              <Link href="/members/new" className="btn-brand inline-block">
                İlk üzvü əlavə et
              </Link>
            )}
          </div>
        ) : (
          <div className="card divide-y divide-[var(--border)]">
            {members.map((m) => (
              <Link
                key={m.id}
                href={`/members/${m.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-[var(--background)] transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[var(--brand-soft)] text-[var(--brand-strong)] flex items-center justify-center text-sm font-semibold shrink-0 overflow-hidden">
                    {m.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.photoUrl}
                        alt={m.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      m.name.slice(0, 1).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{m.name}</div>
                    <div className="text-[11px] text-[var(--muted)]">
                      {m.publicId} · {m.phone}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm text-[var(--muted)] hidden sm:inline">
                    {formatAZN(m.planPrice)}
                  </span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_COLOR[m.status]}`}
                  >
                    {STATUS_LABEL[m.status]}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
