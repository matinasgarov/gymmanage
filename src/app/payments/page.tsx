import Link from "next/link";
import { Receipt, Search, Download, ArrowUp, ArrowDown } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/dal";
import { getT } from "@/lib/i18n-server";
import type { TFunction } from "@/lib/i18n";
import { formatAZN } from "@/lib/members";
import { waReminderUrl } from "@/lib/dashboard";
import {
  getPaymentsList,
  type PaymentsListResult,
  type PaymentRow,
  type PaymentSort,
  type PaymentStatusFilter,
} from "@/lib/payments-list";
import { Pagination } from "@/components/list-controls";
import { UrlSelect } from "@/components/url-select";

const STATUS_CHIPS: { value: PaymentStatusFilter; labelKey: string }[] = [
  { value: "all", labelKey: "common.all" },
  { value: "paid", labelKey: "payments.filterPaid" },
  { value: "unpaid", labelKey: "payments.filterUnpaid" },
  { value: "overdue", labelKey: "paymentStatus.OVERDUE" },
];

// Spec-aligned filter dropdown styling (bg --d-bg, border --d-bdr, blue hover).
const SELECT_CLASS =
  "rounded-[9px] border border-[var(--d-bdr)] bg-[var(--d-bg)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--d-tx2)] outline-none cursor-pointer hover:border-[#3b7bf6] transition-colors";

function naturalDir(sort: PaymentSort): "asc" | "desc" {
  return sort === "date" ? "desc" : "asc";
}

function buildHref(
  r: PaymentsListResult,
  o: Partial<Record<"q" | "status" | "method" | "range" | "sort" | "dir" | "page", string | null>>
): string {
  const next: Record<string, string> = {
    q: r.q,
    status: r.status,
    method: r.method ?? "",
    range: r.range,
    sort: r.sort,
    dir: r.dir,
    page: String(r.page),
  };
  for (const [k, v] of Object.entries(o)) next[k] = v ?? "";

  const sp = new URLSearchParams();
  if (next.q) sp.set("q", next.q);
  if (next.status && next.status !== "all") sp.set("status", next.status);
  if (next.method) sp.set("method", next.method);
  if (next.range && next.range !== "all") sp.set("range", next.range);
  if (next.sort && next.sort !== "date") sp.set("sort", next.sort);
  if (next.dir && next.dir !== naturalDir((next.sort || "date") as PaymentSort))
    sp.set("dir", next.dir);
  if (next.page && next.page !== "1") sp.set("page", next.page);

  const qs = sp.toString();
  return qs ? `/payments?${qs}` : "/payments";
}

function exportHref(r: PaymentsListResult): string {
  const sp = new URLSearchParams();
  if (r.q) sp.set("q", r.q);
  if (r.status !== "all") sp.set("status", r.status);
  if (r.method) sp.set("method", r.method);
  if (r.range !== "all") sp.set("range", r.range);
  if (r.sort !== "date") sp.set("sort", r.sort);
  if (r.dir !== naturalDir(r.sort)) sp.set("dir", r.dir);
  const qs = sp.toString();
  return qs ? `/payments/export?${qs}` : "/payments/export";
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getCurrentUser();
  const t = await getT();
  const sp = await searchParams;
  const METHOD_OPTIONS = [
    { value: "", label: t("payments.allMethods") },
    { value: "CASH", label: t("method.CASH") },
    { value: "CARD", label: t("method.CARD") },
    { value: "TRANSFER", label: t("method.TRANSFER") },
  ];
  const RANGE_OPTIONS = [
    { value: "", label: t("payments.allTime") },
    { value: "this_month", label: t("payments.thisMonth") },
    { value: "last_month", label: t("payments.lastMonth") },
    { value: "this_year", label: t("payments.thisYear") },
  ];
  const r = await getPaymentsList(user.gymId, {
    q: sp.q,
    status: sp.status,
    method: sp.method,
    range: sp.range,
    sort: sp.sort,
    dir: sp.dir,
    page: sp.page,
  });

  return (
    <AppShell>
      <PageHeader
        title={t("nav.payments")}
        subtitle={user.gym.name}
        icon={Receipt}
        tone="dark"
        actions={
          <a
            href={exportHref(r)}
            download
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-white/20 bg-white/10 px-4 py-2 text-[12.5px] font-bold text-white transition-colors hover:bg-white/20"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">{t("payments.exportCsv")}</span>
          </a>
        }
      />

      <div className="dash min-h-full px-6 py-6 space-y-[18px]">
        {/* Hero stats — featured "collected" + two count cards. */}
        <section className="grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr] gap-4">
          <div
            className="relative overflow-hidden rounded-2xl px-7 py-6 text-white"
            style={{
              background: "#0f2044",
              boxShadow: "0 4px 24px rgba(11,22,40,.1), 0 1px 4px rgba(11,22,40,.05)",
            }}
          >
            <div
              className="absolute pointer-events-none"
              style={{
                top: -50, right: -50, width: 180, height: 180,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(59,123,246,.18) 0%, transparent 70%)",
              }}
            />
            <span
              className="block text-[10.5px] font-bold uppercase tracking-[1px]"
              style={{ color: "rgba(255,255,255,.38)" }}
            >
              {t("payments.collected")}
            </span>
            <div className="mt-1.5 text-[42px] font-extrabold leading-none tracking-[-2px] text-white">
              {formatAZN(r.summary.collected)}
            </div>
          </div>

          <StatCard label={t("payments.paidCount")} value={String(r.summary.paidCount)} />
          <StatCard label={t("payments.payingMembers")} value={String(r.summary.payingMembers)} />
        </section>

        {/* Filters — search row + tabs row, all URL-driven. */}
        <div
          className="overflow-hidden rounded-2xl bg-white"
          style={{ boxShadow: "var(--d-sh1)" }}
        >
          <form
            className="flex items-center gap-2.5 px-[18px] py-3.5"
            style={{ borderBottom: "1px solid var(--d-bdr)" }}
          >
            <Search className="w-[15px] h-[15px] shrink-0" style={{ color: "var(--d-tx3)" }} />
            <input
              name="q"
              defaultValue={r.q}
              placeholder={t("payments.searchPlaceholder")}
              className="flex-1 bg-transparent text-[13.5px] font-medium outline-none"
              style={{ color: "var(--d-tx)" }}
            />
            {r.status !== "all" && <input type="hidden" name="status" value={r.status} />}
            {r.method && <input type="hidden" name="method" value={r.method} />}
            {r.range !== "all" && <input type="hidden" name="range" value={r.range} />}
            {r.sort !== "date" && <input type="hidden" name="sort" value={r.sort} />}
            <button
              type="submit"
              className="shrink-0 px-1 text-[12.5px] font-bold text-[#3b7bf6] hover:text-[#2d6ef0]"
            >
              {t("common.search")}
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-3 px-[18px] py-2.5">
            <div className="flex flex-wrap gap-1">
              {STATUS_CHIPS.map((c) => (
                <Tab
                  key={c.value}
                  href={buildHref(r, { status: c.value === "all" ? null : c.value, page: null })}
                  active={r.status === c.value}
                  label={t(c.labelKey)}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <UrlSelect
                param="method"
                value={r.method ?? ""}
                options={METHOD_OPTIONS}
                ariaLabel={t("payments.methodFilter")}
                className={SELECT_CLASS}
              />
              <UrlSelect
                param="range"
                value={r.range === "all" ? "" : r.range}
                options={RANGE_OPTIONS}
                ariaLabel={t("payments.rangeFilter")}
                className={SELECT_CLASS}
              />
            </div>
          </div>
        </div>

        {r.rows.length === 0 ? (
          <div
            className="rounded-2xl bg-white p-10 text-center"
            style={{ boxShadow: "var(--d-sh1)" }}
          >
            <Receipt className="mx-auto mb-2 h-8 w-8" style={{ color: "var(--d-tx3)" }} />
            <p className="text-sm" style={{ color: "var(--d-tx3)" }}>
              {t("members.noResults")}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div
              className="hidden overflow-x-auto rounded-2xl bg-white lg:block"
              style={{ boxShadow: "var(--d-sh1)" }}
            >
              <table className="w-full min-w-[800px] border-collapse">
                <thead>
                  <tr>
                    <SortHeader r={r} col="name" label={t("members.colMember")} />
                    <Th label={t("payments.colPeriod")} />
                    <SortHeader r={r} col="date" label={t("payments.colDate")} />
                    <Th label={t("payments.colMethod")} />
                    <SortHeader r={r} col="amount" label={t("payments.colAmount")} />
                    <Th label={t("members.colStatus")} />
                    <th
                      className="px-5 py-3"
                      style={{ borderBottom: "1px solid var(--d-bdr)" }}
                      aria-label={t("members.actions")}
                    />
                  </tr>
                </thead>
                <tbody>
                  {r.rows.map((p) => (
                    <TableRow key={p.id} p={p} gym={user.gym} t={t} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div
              className="overflow-hidden rounded-2xl bg-white lg:hidden"
              style={{ boxShadow: "var(--d-sh1)" }}
            >
              {r.rows.map((p) => (
                <CardRow key={p.id} p={p} gym={user.gym} t={t} />
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

type GymForReminder = Parameters<typeof waReminderUrl>[0];

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-6 py-5" style={{ boxShadow: "var(--d-sh1)" }}>
      <span
        className="block text-[10.5px] font-bold uppercase tracking-[1px]"
        style={{ color: "var(--d-tx3)" }}
      >
        {label}
      </span>
      <div
        className="mt-1.5 text-[40px] font-extrabold leading-none tracking-[-2px]"
        style={{ color: "var(--d-tx)" }}
      >
        {value}
      </div>
    </div>
  );
}

function Tab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-3.5 py-[5px] text-[12.5px] font-bold transition-colors ${
        active
          ? "bg-[#3b7bf6] text-white shadow-[0_2px_8px_rgba(59,123,246,.3)]"
          : "text-[var(--d-tx3)] hover:bg-[var(--d-accent-lt)] hover:text-[#3b7bf6]"
      }`}
    >
      {label}
    </Link>
  );
}

function Th({ label }: { label: string }) {
  return (
    <th
      className="px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.9px] whitespace-nowrap"
      style={{ color: "var(--d-tx3)", borderBottom: "1px solid var(--d-bdr)" }}
    >
      {label}
    </th>
  );
}

function SortHeader({
  r,
  col,
  label,
}: {
  r: PaymentsListResult;
  col: PaymentSort;
  label: string;
}) {
  const active = r.sort === col;
  const nextDir = active ? (r.dir === "asc" ? "desc" : "asc") : naturalDir(col);
  const href = buildHref(r, { sort: col, dir: nextDir, page: null });
  return (
    <th
      className="px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.9px] whitespace-nowrap"
      style={{ color: "var(--d-tx3)", borderBottom: "1px solid var(--d-bdr)" }}
    >
      <Link href={href} className="inline-flex items-center gap-1 hover:text-[#3b7bf6]">
        {label}
        {active &&
          (r.dir === "asc" ? (
            <ArrowUp className="w-3 h-3 text-[#3b7bf6]" />
          ) : (
            <ArrowDown className="w-3 h-3 text-[#3b7bf6]" />
          ))}
      </Link>
    </th>
  );
}

// Map effective payment status to the spec's badge palette.
function statusStyle(eff: string): { background: string; color: string } {
  if (eff === "PAID") return { background: "var(--d-green-lt)", color: "var(--d-green)" };
  if (eff === "OVERDUE") return { background: "var(--d-red-lt)", color: "var(--d-red)" };
  return { background: "var(--d-warn-lt)", color: "var(--d-warn)" };
}

function StatusBadge({ eff, t }: { eff: string; t: TFunction }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap"
      style={statusStyle(eff)}
    >
      {t(`paymentStatus.${eff}`)}
    </span>
  );
}

function WhatsAppNudge({ p, gym, t }: { p: PaymentRow; gym: GymForReminder; t: TFunction }) {
  if (p.eff === "PAID" || !p.phone) return <span style={{ color: "var(--d-tx3)" }}>—</span>;
  const url = waReminderUrl(
    gym,
    { name: p.memberName, phone: p.phone },
    p.periodLabel,
    formatAZN(p.amount)
  );
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600"
    >
      {t("common.whatsapp")}
    </a>
  );
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function TableRow({ p, gym, t }: { p: PaymentRow; gym: GymForReminder; t: TFunction }) {
  const big = p.amount >= 1000;
  return (
    <tr
      className="transition-colors hover:bg-[var(--d-accent-lt)]"
      style={{ borderBottom: "1px solid var(--d-bdr)" }}
    >
      <td className="px-5 py-3.5">
        <Link href={`/members/${p.memberId}`} className="block min-w-0">
          <div className="text-[13.5px] font-bold truncate" style={{ color: "var(--d-tx)" }}>
            {p.memberName}
          </div>
          <div className="text-[11.5px] font-medium" style={{ color: "var(--d-tx3)" }}>
            {p.publicId}
          </div>
        </Link>
      </td>
      <td className="px-4 py-3.5 text-[13px] font-medium" style={{ color: "var(--d-tx2)" }}>
        {p.periodLabel}
      </td>
      <td
        className="px-4 py-3.5 text-[13px] font-semibold tabular-nums"
        style={{ color: "var(--d-tx)" }}
      >
        {p.paidAt ? fmtDate(p.paidAt) : "—"}
      </td>
      <td className="px-4 py-3.5 text-[13px] font-semibold" style={{ color: "var(--d-tx2)" }}>
        {p.method ? t(`method.${p.method}`) : "—"}
      </td>
      <td
        className="px-4 py-3.5 text-[15px] font-extrabold tracking-[-0.4px] tabular-nums"
        style={{ color: big ? "#3b7bf6" : "var(--d-tx)" }}
      >
        {formatAZN(p.amount)}
      </td>
      <td className="px-4 py-3.5">
        <StatusBadge eff={p.eff} t={t} />
      </td>
      <td className="px-5 py-3.5 text-right">
        <WhatsAppNudge p={p} gym={gym} t={t} />
      </td>
    </tr>
  );
}

function CardRow({ p, gym, t }: { p: PaymentRow; gym: GymForReminder; t: TFunction }) {
  const big = p.amount >= 1000;
  return (
    <div className="px-4 py-3.5" style={{ borderBottom: "1px solid var(--d-bdr)" }}>
      <Link href={`/members/${p.memberId}`} className="block">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[13.5px] font-bold truncate" style={{ color: "var(--d-tx)" }}>
              {p.memberName}
            </div>
            <div className="text-[11.5px] font-medium" style={{ color: "var(--d-tx3)" }}>
              {p.publicId} · {p.periodLabel}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className="text-[15px] font-extrabold tracking-[-0.4px] tabular-nums"
              style={{ color: big ? "#3b7bf6" : "var(--d-tx)" }}
            >
              {formatAZN(p.amount)}
            </span>
            <StatusBadge eff={p.eff} t={t} />
          </div>
        </div>
      </Link>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11.5px]">
        <span style={{ color: "var(--d-tx3)" }}>
          {p.paidAt ? fmtDate(p.paidAt) : t("payments.notPaid")}
          {p.method ? ` · ${t(`method.${p.method}`)}` : ""}
        </span>
        <WhatsAppNudge p={p} gym={gym} t={t} />
      </div>
    </div>
  );
}
