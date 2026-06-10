import Link from "next/link";
import { Users, Plus, Search, ArrowUp, ArrowDown } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/dal";
import { getT } from "@/lib/i18n-server";
import type { TFunction } from "@/lib/i18n";
import { MEMBER_STATUS_COLOR as STATUS_COLOR } from "@/lib/labels";
import { PLAN_TYPES } from "@/config/gym-plans";
import {
  getMembersList,
  type MembersListResult,
  type MemberRow,
  type MemberSort,
  type MemberStatusFilter,
} from "@/lib/members-list";
import {
  expiryInfo,
  lastSeenLabel,
  shortDate,
  effectiveMemberStatus,
  type SignalTone,
} from "@/lib/members-format";
import { MemberRowActions } from "@/components/member-row-actions";
import { Chip, Pagination } from "@/components/list-controls";
import { UrlSelect } from "@/components/url-select";

const STATUS_CHIPS: { value: MemberStatusFilter; labelKey: string }[] = [
  { value: "all", labelKey: "common.all" },
  { value: "active", labelKey: "status.ACTIVE" },
  { value: "overdue", labelKey: "status.OVERDUE" },
  { value: "expiring", labelKey: "members.filterExpiring" },
  { value: "expired", labelKey: "status.EXPIRED" },
  { value: "frozen", labelKey: "members.filterFrozen" },
];

// Build a /members URL from the current state plus overrides. Defaults are
// omitted so URLs stay clean; null clears a value. Filter/sort changes pass
// page:null to reset to the first page.
function buildHref(
  r: MembersListResult,
  o: Partial<Record<"q" | "status" | "plan" | "sort" | "dir" | "page", string | null>>
): string {
  const next: Record<string, string> = {
    q: r.q,
    status: r.status,
    plan: r.plan ?? "",
    sort: r.sort,
    dir: r.dir,
    page: String(r.page),
  };
  for (const [k, v] of Object.entries(o)) next[k] = v ?? "";

  const sp = new URLSearchParams();
  if (next.q) sp.set("q", next.q);
  if (next.status && next.status !== "all") sp.set("status", next.status);
  if (next.plan) sp.set("plan", next.plan);
  if (next.sort && next.sort !== "expiry") sp.set("sort", next.sort);
  if (next.dir && next.dir !== "asc") sp.set("dir", next.dir);
  if (next.page && next.page !== "1") sp.set("page", next.page);

  const qs = sp.toString();
  return qs ? `/members?${qs}` : "/members";
}

function toneText(tone: SignalTone): string {
  return tone === "danger"
    ? "text-[var(--signal-danger)]"
    : tone === "warn"
      ? "text-[var(--signal-warn)]"
      : "text-[var(--muted)]";
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getCurrentUser();
  const t = await getT();
  const sp = await searchParams;
  const PLAN_OPTIONS = [
    { value: "", label: t("members.allPlans") },
    ...PLAN_TYPES.map((p) => ({ value: p, label: t(`plan.${p}`) })),
  ];
  const r = await getMembersList(user.gymId, {
    q: sp.q,
    status: sp.status,
    plan: sp.plan,
    sort: sp.sort,
    dir: sp.dir,
    page: sp.page,
  });

  return (
    <AppShell>
      <PageHeader
        title={t("nav.members")}
        subtitle={`${t("members.count", { count: r.total })}${r.q ? ` · "${r.q}"` : ""}`}
        icon={Users}
        tone="dark"
        actions={
          <Link href="/members/new" className="btn-brand inline-flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t("members.newMember")}</span>
          </Link>
        }
      />

      <div className="px-4 lg:px-8 py-6 space-y-4">
        {/* Toolbar — search + status chips + plan chips. All URL-driven. */}
        <div className="space-y-3">
          <form className="card flex items-center gap-2 px-3 py-2">
            <Search className="w-4 h-4 text-[var(--muted)] shrink-0" />
            <input
              name="q"
              defaultValue={r.q}
              placeholder={t("members.searchPlaceholder")}
              className="flex-1 outline-none text-sm bg-transparent"
            />
            {/* Preserve active filters/sort on search; page resets (no page input). */}
            {r.status !== "all" && <input type="hidden" name="status" value={r.status} />}
            {r.plan && <input type="hidden" name="plan" value={r.plan} />}
            {r.sort !== "expiry" && <input type="hidden" name="sort" value={r.sort} />}
            {r.dir !== "asc" && <input type="hidden" name="dir" value={r.dir} />}
            <button type="submit" className="text-xs text-[var(--brand-strong)] font-medium px-2">
              {t("common.search")}
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_CHIPS.map((c) => (
              <Chip
                key={c.value}
                href={buildHref(r, { status: c.value === "all" ? null : c.value, page: null })}
                active={r.status === c.value}
                label={t(c.labelKey)}
              />
            ))}
            <div className="ml-auto">
              <UrlSelect
                param="plan"
                value={r.plan ?? ""}
                options={PLAN_OPTIONS}
                ariaLabel={t("members.planFilter")}
              />
            </div>
          </div>
        </div>

        {r.rows.length === 0 ? (
          <div className="card p-10 text-center">
            <Users className="w-8 h-8 text-[var(--muted)] mx-auto mb-2" />
            <p className="text-sm text-[var(--muted)] mb-3">
              {r.q || r.status !== "all" || r.plan
                ? t("members.noResults")
                : t("members.empty")}
            </p>
            {!r.q && r.status === "all" && !r.plan && (
              <Link href="/members/new" className="btn-brand inline-block">
                {t("members.addFirst")}
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Desktop: sortable data table */}
            {/* No overflow-hidden here: it would clip the row actions dropdown. */}
            <div className="card hidden lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                    <SortHeader r={r} col="name" label={t("members.colMember")} />
                    <th className="px-4 py-2.5 font-medium">{t("members.colPlan")}</th>
                    <th className="px-4 py-2.5 font-medium">{t("members.colStatus")}</th>
                    <SortHeader r={r} col="expiry" label={t("members.colExpiry")} />
                    <th className="px-4 py-2.5 font-medium">{t("members.colLastSeen")}</th>
                    <th className="px-4 py-2.5 font-medium">{t("members.colPayment")}</th>
                    <th className="px-4 py-2.5 font-medium w-10" aria-label={t("members.actions")} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {r.rows.map((m) => (
                    <TableRow key={m.id} m={m} t={t} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: enriched cards */}
            <div className="card divide-y divide-[var(--border)] lg:hidden">
              {r.rows.map((m) => (
                <CardRow key={m.id} m={m} t={t} />
              ))}
            </div>

            <Pagination
              page={r.page}
              totalPages={r.totalPages}
              hrefForPage={(n) => buildHref(r, { page: String(n) })}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}

function SortHeader({ r, col, label }: { r: MembersListResult; col: MemberSort; label: string }) {
  const active = r.sort === col;
  const nextDir = active && r.dir === "asc" ? "desc" : "asc";
  const href = buildHref(r, { sort: col, dir: nextDir, page: null });
  return (
    <th className="px-4 py-2.5 font-medium">
      <Link href={href} className="inline-flex items-center gap-1 hover:text-[var(--foreground)]">
        {label}
        {active &&
          (r.dir === "asc" ? (
            <ArrowUp className="w-3 h-3" />
          ) : (
            <ArrowDown className="w-3 h-3" />
          ))}
      </Link>
    </th>
  );
}

function Avatar({ m }: { m: MemberRow }) {
  return (
    <div className="w-9 h-9 rounded-full bg-[var(--brand-soft)] text-[var(--brand-strong)] flex items-center justify-center text-sm font-semibold shrink-0 overflow-hidden">
      {m.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={m.photoUrl} alt={m.name} className="w-full h-full object-cover" />
      ) : (
        m.name.slice(0, 1).toUpperCase()
      )}
    </div>
  );
}

function StatusBadge({ status, t }: { status: string; t: TFunction }) {
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_COLOR[status]}`}>
      {t(`status.${status}`)}
    </span>
  );
}

function OverdueBadge({ t }: { t: TFunction }) {
  return (
    <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-[var(--signal-danger)] font-medium">
      {t("status.OVERDUE")}
    </span>
  );
}

function TableRow({ m, t }: { m: MemberRow; t: TFunction }) {
  const exp = expiryInfo(m.expiryDate, t);
  return (
    <tr className="hover:bg-[var(--background)] transition-colors">
      <td className="px-4 py-3">
        <Link href={`/members/${m.id}`} className="flex items-center gap-3 min-w-0">
          <Avatar m={m} />
          <div className="min-w-0">
            <div className="font-medium truncate">{m.name}</div>
            <div className="text-[11px] text-[var(--muted)]">{m.publicId}</div>
          </div>
        </Link>
      </td>
      <td className="px-4 py-3 text-[var(--muted)]">{t(`plan.${m.planType}`)}</td>
      <td className="px-4 py-3">
        <StatusBadge status={effectiveMemberStatus(m)} t={t} />
      </td>
      <td className="px-4 py-3">
        <div className={`font-medium ${toneText(exp.tone)}`}>{exp.label}</div>
        <div className="text-[11px] text-[var(--muted)]">{shortDate(m.expiryDate)}</div>
      </td>
      <td className="px-4 py-3 text-[var(--muted)]">{lastSeenLabel(m.lastCheckInAt, t)}</td>
      <td className="px-4 py-3">{m.isOverdue ? <OverdueBadge t={t} /> : <span className="text-[var(--muted)]">—</span>}</td>
      <td className="px-2 py-3">
        <MemberRowActions
          memberId={m.id}
          name={m.name}
          phone={m.phone}
          expiryDate={m.expiryDate.toISOString()}
        />
      </td>
    </tr>
  );
}

function CardRow({ m, t }: { m: MemberRow; t: TFunction }) {
  const exp = expiryInfo(m.expiryDate, t);
  return (
    <div className="relative">
      <Link href={`/members/${m.id}`} className="block px-4 py-3 hover:bg-[var(--background)] transition-colors">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar m={m} />
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{m.name}</div>
              <div className="text-[11px] text-[var(--muted)]">
                {m.publicId} · {m.phone}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={effectiveMemberStatus(m)} t={t} />
          </div>
        </div>
        <div className="mt-2.5 pt-2.5 border-t border-[var(--border)] flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          <span className="text-[var(--muted)]">{t(`plan.${m.planType}`)}</span>
          <span className="text-[var(--muted)]">·</span>
          <span className={toneText(exp.tone)}>{t("members.expiryPrefix")}: {exp.label}</span>
          {m.isOverdue && <OverdueBadge t={t} />}
          <span className="text-[var(--muted)] basis-full">
            {t("members.lastSeenPrefix")}: {lastSeenLabel(m.lastCheckInAt, t)}
          </span>
        </div>
      </Link>
      {/* Actions sit above the card link so taps don't navigate the row. */}
      <div className="absolute top-3 right-3">
        <MemberRowActions
          memberId={m.id}
          name={m.name}
          phone={m.phone}
          expiryDate={m.expiryDate.toISOString()}
        />
      </div>
    </div>
  );
}
