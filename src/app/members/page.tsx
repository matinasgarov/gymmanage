import Link from "next/link";
import { Users, Plus, Search, ArrowUp, ArrowDown } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser } from "@/lib/dal";
import { getT } from "@/lib/i18n-server";
import type { TFunction } from "@/lib/i18n";
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
} from "@/lib/members-format";
import { MemberRowActions } from "@/components/member-row-actions";
import { Pagination } from "@/components/list-controls";
import { UrlSelect } from "@/components/url-select";

const STATUS_CHIPS: { value: MemberStatusFilter; labelKey: string }[] = [
  { value: "all", labelKey: "common.all" },
  { value: "active", labelKey: "status.ACTIVE" },
  { value: "overdue", labelKey: "status.OVERDUE" },
  { value: "expiring", labelKey: "members.filterExpiring" },
  { value: "expired", labelKey: "status.EXPIRED" },
  { value: "frozen", labelKey: "members.filterFrozen" },
];

// Status badge colors — mapped to the blue/navy design system tokens.
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  ACTIVE: { bg: "rgba(16,185,129,.12)", color: "#10b981" },
  OVERDUE: { bg: "rgba(245,158,11,.1)", color: "#f59e0b" },
  FROZEN: { bg: "rgba(139,92,246,.1)", color: "#8b5cf6" },
  EXPIRED: { bg: "rgba(11,22,40,.06)", color: "#8aa0bc" },
  CANCELLED: { bg: "rgba(239,68,68,.1)", color: "#ef4444" },
};

// Avatar tints, picked deterministically from the member name so each row reads
// distinctly without storing a color.
const AVATAR_PALETTE: { bg: string; color: string }[] = [
  { bg: "#e0e7ff", color: "#4f46e5" },
  { bg: "rgba(59,123,246,.15)", color: "#3b7bf6" },
  { bg: "rgba(16,185,129,.13)", color: "#10b981" },
  { bg: "rgba(245,158,11,.13)", color: "#f59e0b" },
  { bg: "rgba(139,92,246,.13)", color: "#8b5cf6" },
];
function avatarTint(name: string) {
  const code = name.charCodeAt(0) || 0;
  return AVATAR_PALETTE[code % AVATAR_PALETTE.length];
}

function isSameLocalDay(d: Date, ref: Date) {
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

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
      <div className="dash min-h-full">
        {/* ── Header banner ───────────────────────────────── */}
        <div
          className="text-white"
          style={{ background: "linear-gradient(135deg, #0f2044, var(--sidebar-bg))" }}
        >
          <div className="px-4 lg:px-8 py-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-white/10">
                <Users className="w-5 h-5" style={{ color: "#3b7bf6" }} />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold leading-tight truncate text-white">
                  {t("nav.members")}
                </h1>
                <p className="text-xs mt-0.5 truncate text-white/70">
                  {t("members.count", { count: r.total })}
                  {r.q ? ` · "${r.q}"` : ""}
                </p>
              </div>
            </div>
            <Link
              href="/members/new"
              className="btn-primary shrink-0"
              style={{ background: "#3b7bf6" }}
            >
              <Plus className="w-4 h-4" strokeWidth={2.8} />
              <span className="hidden sm:inline">{t("members.newMember")}</span>
            </Link>
          </div>
        </div>

        <div className="px-4 lg:px-8 py-6 space-y-[18px]">
          {/* ── Search + filters card ───────────────────────── */}
          <div
            className="rounded-2xl bg-white overflow-hidden"
            style={{ boxShadow: "var(--d-sh1)" }}
          >
            <form
              className="flex items-center gap-2.5 px-[18px] py-3.5 border-b"
              style={{ borderColor: "var(--d-bdr)" }}
            >
              <Search className="w-[15px] h-[15px] shrink-0" style={{ color: "var(--d-tx3)" }} />
              <input
                name="q"
                defaultValue={r.q}
                placeholder={t("members.searchPlaceholder")}
                className="flex-1 outline-none text-[13.5px] font-medium bg-transparent placeholder:text-[#8aa0bc]"
                style={{ color: "var(--d-tx)" }}
              />
              {/* Preserve active filters/sort on search; page resets. */}
              {r.status !== "all" && <input type="hidden" name="status" value={r.status} />}
              {r.plan && <input type="hidden" name="plan" value={r.plan} />}
              {r.sort !== "expiry" && <input type="hidden" name="sort" value={r.sort} />}
              {r.dir !== "asc" && <input type="hidden" name="dir" value={r.dir} />}
              <button
                type="submit"
                className="text-[12.5px] font-bold px-1 shrink-0 transition-colors hover:opacity-80"
                style={{ color: "#3b7bf6" }}
              >
                {t("common.search")}
              </button>
            </form>

            <div className="flex items-center justify-between gap-3 px-[18px] py-2.5">
              <div className="flex flex-wrap items-center gap-1">
                {STATUS_CHIPS.map((c) => (
                  <FilterTab
                    key={c.value}
                    href={buildHref(r, { status: c.value === "all" ? null : c.value, page: null })}
                    active={r.status === c.value}
                    label={t(c.labelKey)}
                  />
                ))}
              </div>
              <UrlSelect
                param="plan"
                value={r.plan ?? ""}
                options={PLAN_OPTIONS}
                ariaLabel={t("members.planFilter")}
                className="text-[12.5px] font-semibold rounded-[9px] border bg-[#eef1f8] px-3 py-1.5 text-[#4a637a] outline-none cursor-pointer hover:border-[#3b7bf6] border-[rgba(11,22,40,.07)] transition-colors"
              />
            </div>
          </div>

          {r.rows.length === 0 ? (
            <div
              className="rounded-2xl bg-white p-10 text-center"
              style={{ boxShadow: "var(--d-sh1)" }}
            >
              <Users className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--d-tx3)" }} />
              <p className="text-sm mb-3" style={{ color: "var(--d-tx3)" }}>
                {r.q || r.status !== "all" || r.plan
                  ? t("members.noResults")
                  : t("members.empty")}
              </p>
              {!r.q && r.status === "all" && !r.plan && (
                <Link href="/members/new" className="btn-primary inline-flex">
                  {t("members.addFirst")}
                </Link>
              )}
            </div>
          ) : (
            <>
              {/* Desktop: sortable data table. No overflow-hidden — it would clip
                  the row actions dropdown. */}
              <div
                className="rounded-2xl bg-white hidden lg:block overflow-x-auto"
                style={{ boxShadow: "var(--d-sh1)" }}
              >
                <table className="w-full min-w-[760px] border-collapse">
                  <thead>
                    <tr>
                      <SortHeader r={r} col="name" label={t("members.colMember")} first />
                      <Th>{t("members.colPlan")}</Th>
                      <Th>{t("members.colStatus")}</Th>
                      <SortHeader r={r} col="expiry" label={t("members.colExpiry")} />
                      <Th>{t("members.colLastSeen")}</Th>
                      <Th>{t("members.colPayment")}</Th>
                      <Th last aria-label={t("members.actions")} />
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((m) => (
                      <TableRow key={m.id} m={m} t={t} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: enriched cards */}
              <div
                className="rounded-2xl bg-white divide-y lg:hidden"
                style={{ boxShadow: "var(--d-sh1)", borderColor: "var(--d-bdr)" }}
              >
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
      </div>
    </AppShell>
  );
}

function FilterTab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className="px-3.5 py-[5px] rounded-lg text-[12.5px] font-bold transition-colors"
      style={
        active
          ? { background: "#3b7bf6", color: "#fff", boxShadow: "0 2px 8px rgba(59,123,246,.3)" }
          : { color: "var(--d-tx3)" }
      }
    >
      {label}
    </Link>
  );
}

function Th({
  children,
  last,
  ...rest
}: {
  children?: React.ReactNode;
  last?: boolean;
  "aria-label"?: string;
}) {
  return (
    <th
      className={`text-[10.5px] font-bold uppercase tracking-[0.9px] py-3 px-4 text-left whitespace-nowrap ${last ? "pr-5 w-10 text-right" : ""}`}
      style={{ color: "var(--d-tx3)", borderBottom: "1px solid var(--d-bdr)" }}
      {...rest}
    >
      {children}
    </th>
  );
}

function SortHeader({
  r,
  col,
  label,
  first,
}: {
  r: MembersListResult;
  col: MemberSort;
  label: string;
  first?: boolean;
}) {
  const active = r.sort === col;
  const nextDir = active && r.dir === "asc" ? "desc" : "asc";
  const href = buildHref(r, { sort: col, dir: nextDir, page: null });
  return (
    <th
      className={`text-[10.5px] font-bold uppercase tracking-[0.9px] py-3 px-4 text-left whitespace-nowrap ${first ? "pl-5 w-[30%]" : ""}`}
      style={{ color: "var(--d-tx3)", borderBottom: "1px solid var(--d-bdr)" }}
    >
      <Link href={href} className="inline-flex items-center gap-1 hover:text-[#0b1628]">
        {label}
        {active &&
          (r.dir === "asc" ? (
            <ArrowUp className="w-3 h-3" style={{ color: "#3b7bf6" }} />
          ) : (
            <ArrowDown className="w-3 h-3" style={{ color: "#3b7bf6" }} />
          ))}
      </Link>
    </th>
  );
}

function Avatar({ m }: { m: MemberRow }) {
  const tint = avatarTint(m.name);
  return (
    <div
      className="w-[38px] h-[38px] rounded-full flex items-center justify-center text-[15px] font-extrabold shrink-0 overflow-hidden"
      style={{ background: tint.bg, color: tint.color }}
    >
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
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.EXPIRED;
  return (
    <span
      className="inline-flex items-center text-[11.5px] font-bold px-[11px] py-1 rounded-full"
      style={{ background: s.bg, color: s.color }}
    >
      {t(`status.${status}`)}
    </span>
  );
}

function OverdueBadge({ t }: { t: TFunction }) {
  return (
    <span
      className="inline-flex items-center text-[11.5px] font-bold px-[11px] py-1 rounded-full"
      style={{ background: "rgba(245,158,11,.1)", color: "#f59e0b" }}
    >
      {t("status.OVERDUE")}
    </span>
  );
}

function LastSeen({ m, t }: { m: MemberRow; t: TFunction }) {
  const label = lastSeenLabel(m.lastCheckInAt, t);
  const today = m.lastCheckInAt ? isSameLocalDay(m.lastCheckInAt, new Date()) : false;
  if (today) {
    return (
      <span
        className="inline-block text-[13px] font-bold px-2.5 py-[3px] rounded-full"
        style={{ background: "rgba(59,123,246,.12)", color: "#3b7bf6" }}
      >
        {label}
      </span>
    );
  }
  return (
    <span className="text-[13px] font-medium" style={{ color: "var(--d-tx2)" }}>
      {label}
    </span>
  );
}

function TableRow({ m, t }: { m: MemberRow; t: TFunction }) {
  const exp = expiryInfo(m.expiryDate, t);
  const expWarn = exp.tone === "danger" || exp.tone === "warn";
  return (
    <tr
      className="transition-colors cursor-pointer hover:bg-[rgba(59,123,246,.06)]"
      style={{ borderBottom: "1px solid var(--d-bdr)" }}
    >
      <td className="py-3.5 px-4 pl-5">
        <Link href={`/members/${m.id}`} className="flex items-center gap-3 min-w-0">
          <Avatar m={m} />
          <div className="min-w-0">
            <div className="text-[13.5px] font-bold truncate" style={{ color: "var(--d-tx)" }}>
              {m.name}
            </div>
            <div className="text-[11.5px] font-medium" style={{ color: "var(--d-tx3)" }}>
              {m.publicId}
            </div>
          </div>
        </Link>
      </td>
      <td className="py-3.5 px-4 text-[13px] font-semibold" style={{ color: "var(--d-tx2)" }}>
        {t(`plan.${m.planType}`)}
      </td>
      <td className="py-3.5 px-4">
        <StatusBadge status={effectiveMemberStatus(m)} t={t} />
      </td>
      <td className="py-3.5 px-4">
        <div
          className="text-[14px] font-bold"
          style={{ color: expWarn ? "#f59e0b" : "var(--d-tx)" }}
        >
          {exp.label}
        </div>
        <div className="text-[11.5px] font-medium" style={{ color: "var(--d-tx3)" }}>
          {shortDate(m.expiryDate)}
        </div>
      </td>
      <td className="py-3.5 px-4">
        <LastSeen m={m} t={t} />
      </td>
      <td className="py-3.5 px-4">
        {m.isOverdue ? (
          <OverdueBadge t={t} />
        ) : (
          <span className="text-base" style={{ color: "var(--d-tx3)" }}>
            —
          </span>
        )}
      </td>
      <td className="py-3.5 px-2 pr-5 text-right">
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
  const expWarn = exp.tone === "danger" || exp.tone === "warn";
  return (
    <div className="relative" style={{ borderColor: "var(--d-bdr)" }}>
      <Link
        href={`/members/${m.id}`}
        className="block px-4 py-3.5 transition-colors hover:bg-[rgba(59,123,246,.06)]"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar m={m} />
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold truncate" style={{ color: "var(--d-tx)" }}>
                {m.name}
              </div>
              <div className="text-[11.5px] font-medium" style={{ color: "var(--d-tx3)" }}>
                {m.publicId} · {m.phone}
              </div>
            </div>
          </div>
          <div className="shrink-0">
            <StatusBadge status={effectiveMemberStatus(m)} t={t} />
          </div>
        </div>
        <div
          className="mt-2.5 pt-2.5 border-t flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]"
          style={{ borderColor: "var(--d-bdr)" }}
        >
          <span style={{ color: "var(--d-tx2)" }}>{t(`plan.${m.planType}`)}</span>
          <span style={{ color: "var(--d-tx3)" }}>·</span>
          <span style={{ color: expWarn ? "#f59e0b" : "var(--d-tx2)" }}>
            {t("members.expiryPrefix")}: {exp.label}
          </span>
          {m.isOverdue && <OverdueBadge t={t} />}
          <span className="basis-full" style={{ color: "var(--d-tx3)" }}>
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
