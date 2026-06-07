import Link from "next/link";
import { Receipt, Search, Download, ArrowUp, ArrowDown } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/dal";
import { formatAZN } from "@/lib/members";
import { waReminderUrl } from "@/lib/dashboard";
import {
  PAYMENT_STATUS_COLOR as STATUS_COLOR,
  PAYMENT_STATUS_LABEL as STATUS_LABEL,
  PAY_METHOD_LABEL as PAY_METHOD,
} from "@/lib/labels";
import {
  getPaymentsList,
  type PaymentsListResult,
  type PaymentRow,
  type PaymentSort,
  type PaymentStatusFilter,
} from "@/lib/payments-list";
import { Chip, Pagination } from "@/components/list-controls";
import { UrlSelect } from "@/components/url-select";

const STATUS_CHIPS: { value: PaymentStatusFilter; label: string }[] = [
  { value: "all", label: "Hamısı" },
  { value: "paid", label: "Ödənilmiş" },
  { value: "unpaid", label: "Ödənilməmiş" },
  { value: "overdue", label: "Vaxtı keçib" },
];

const METHOD_OPTIONS = [
  { value: "", label: "Bütün üsullar" },
  { value: "CASH", label: "Nağd" },
  { value: "CARD", label: "Kart" },
  { value: "TRANSFER", label: "Köçürmə" },
];

const RANGE_OPTIONS = [
  { value: "", label: "Bütün vaxt" },
  { value: "this_month", label: "Bu ay" },
  { value: "last_month", label: "Keçən ay" },
  { value: "this_year", label: "Bu il" },
];

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
  const sp = await searchParams;
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
      <PageHeader title="Ödənişlər" subtitle={user.gym.name} icon={Receipt} tone="dark" />

      <div className="px-4 lg:px-8 py-6 space-y-4">
        {/* Summary cards — recompute with the active filter. */}
        <section className="grid grid-cols-3 gap-3">
          <SummaryCard label="Yığılan" value={formatAZN(r.summary.collected)} />
          <SummaryCard label="Ödəniş sayı" value={String(r.summary.paidCount)} />
          <SummaryCard label="Ödəyən üzv" value={String(r.summary.payingMembers)} />
        </section>

        {/* Toolbar */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <form className="card flex items-center gap-2 px-3 py-2 flex-1">
              <Search className="w-4 h-4 text-[var(--muted)] shrink-0" />
              <input
                name="q"
                defaultValue={r.q}
                placeholder="Ad və ya ID ilə axtar…"
                className="flex-1 outline-none text-sm bg-transparent"
              />
              {r.status !== "all" && <input type="hidden" name="status" value={r.status} />}
              {r.method && <input type="hidden" name="method" value={r.method} />}
              {r.range !== "all" && <input type="hidden" name="range" value={r.range} />}
              {r.sort !== "date" && <input type="hidden" name="sort" value={r.sort} />}
              <button type="submit" className="text-xs text-[var(--brand-strong)] font-medium px-2">
                Axtar
              </button>
            </form>
            <a
              href={exportHref(r)}
              className="btn-ghost inline-flex items-center gap-1.5 shrink-0"
              download
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">CSV ixrac</span>
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_CHIPS.map((c) => (
              <Chip
                key={c.value}
                href={buildHref(r, { status: c.value === "all" ? null : c.value, page: null })}
                active={r.status === c.value}
                label={c.label}
              />
            ))}
            <div className="ml-auto flex items-center gap-1.5">
              <UrlSelect
                param="method"
                value={r.method ?? ""}
                options={METHOD_OPTIONS}
                ariaLabel="Üsul filtri"
              />
              <UrlSelect
                param="range"
                value={r.range === "all" ? "" : r.range}
                options={RANGE_OPTIONS}
                ariaLabel="Tarix aralığı"
              />
            </div>
          </div>
        </div>

        {r.rows.length === 0 ? (
          <div className="card p-10 text-center">
            <Receipt className="w-8 h-8 text-[var(--muted)] mx-auto mb-2" />
            <p className="text-sm text-[var(--muted)]">Nəticə tapılmadı.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="card hidden lg:block overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                    <SortHeader r={r} col="name" label="Üzv" />
                    <th className="px-4 py-2.5 font-medium">Period</th>
                    <SortHeader r={r} col="date" label="Tarix" />
                    <th className="px-4 py-2.5 font-medium">Üsul</th>
                    <SortHeader r={r} col="amount" label="Məbləğ" />
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium w-16" aria-label="Əməliyyat" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {r.rows.map((p) => (
                    <TableRow key={p.id} p={p} gym={user.gym} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="card divide-y divide-[var(--border)] lg:hidden">
              {r.rows.map((p) => (
                <CardRow key={p.id} p={p} gym={user.gym} />
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3.5">
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
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
    <th className="px-4 py-2.5 font-medium">
      <Link href={href} className="inline-flex items-center gap-1 hover:text-[var(--foreground)]">
        {label}
        {active &&
          (r.dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </Link>
    </th>
  );
}

function StatusBadge({ eff }: { eff: string }) {
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_COLOR[eff]}`}>
      {STATUS_LABEL[eff]}
    </span>
  );
}

function WhatsAppNudge({ p, gym }: { p: PaymentRow; gym: GymForReminder }) {
  if (p.eff === "PAID" || !p.phone) return <span className="text-[var(--muted)]">—</span>;
  const url = waReminderUrl(
    gym,
    { name: p.memberName, phone: p.phone },
    p.periodLabel,
    formatAZN(p.amount)
  );
  return (
    // No onClick: this server component cannot pass event handlers, and the
    // anchor is not nested inside the row Link, so no propagation stop is needed.
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[11px] bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-3 py-1 shrink-0"
    >
      WhatsApp
    </a>
  );
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function TableRow({ p, gym }: { p: PaymentRow; gym: GymForReminder }) {
  return (
    <tr className="hover:bg-[var(--background)] transition-colors">
      <td className="px-4 py-3">
        <Link href={`/members/${p.memberId}`} className="block min-w-0">
          <div className="font-medium truncate">{p.memberName}</div>
          <div className="text-[11px] text-[var(--muted)]">{p.publicId}</div>
        </Link>
      </td>
      <td className="px-4 py-3 text-[var(--muted)]">{p.periodLabel}</td>
      <td className="px-4 py-3 text-[var(--muted)]">{p.paidAt ? fmtDate(p.paidAt) : "—"}</td>
      <td className="px-4 py-3 text-[var(--muted)]">{p.method ? PAY_METHOD[p.method] : "—"}</td>
      <td className="px-4 py-3 font-medium">{formatAZN(p.amount)}</td>
      <td className="px-4 py-3">
        <StatusBadge eff={p.eff} />
      </td>
      <td className="px-4 py-3">
        <WhatsAppNudge p={p} gym={gym} />
      </td>
    </tr>
  );
}

function CardRow({ p, gym }: { p: PaymentRow; gym: GymForReminder }) {
  return (
    <div className="px-4 py-3">
      <Link href={`/members/${p.memberId}`} className="block">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">{p.memberName}</div>
            <div className="text-[11px] text-[var(--muted)]">
              {p.publicId} · {p.periodLabel}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm font-medium">{formatAZN(p.amount)}</span>
            <StatusBadge eff={p.eff} />
          </div>
        </div>
      </Link>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[var(--muted)]">
        <span>
          {p.paidAt ? fmtDate(p.paidAt) : "Ödənilməyib"}
          {p.method ? ` · ${PAY_METHOD[p.method]}` : ""}
        </span>
        <WhatsAppNudge p={p} gym={gym} />
      </div>
    </div>
  );
}
