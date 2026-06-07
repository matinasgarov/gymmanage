import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { forGym } from "@/lib/tenant";
import { computeEffectiveStatus, formatPeriodLabel } from "@/lib/payments";
import { toCents, centsToNumber } from "@/lib/money";

const OVERDUE_GRACE_DAYS = 5;
export const PAYMENTS_PAGE_SIZE = 25;

export const PAYMENT_SORTS = ["date", "amount", "name"] as const;
export type PaymentSort = (typeof PAYMENT_SORTS)[number];

export const PAYMENT_STATUS_FILTERS = ["all", "paid", "unpaid", "overdue"] as const;
export type PaymentStatusFilter = (typeof PAYMENT_STATUS_FILTERS)[number];

const METHODS = ["CASH", "CARD", "TRANSFER"] as const;

export const PAYMENT_RANGES = ["all", "this_month", "last_month", "this_year"] as const;
export type PaymentRange = (typeof PAYMENT_RANGES)[number];

export type PaymentsListParams = {
  q?: string;
  status?: string;
  method?: string;
  range?: string;
  sort?: string;
  dir?: string;
  page?: string;
};

export type PaymentRow = {
  id: string;
  memberId: string;
  memberName: string;
  publicId: string;
  phone: string;
  period: string;
  periodLabel: string;
  dueDate: Date;
  paidAt: Date | null;
  method: string | null;
  amount: number;
  eff: "PAID" | "PENDING" | "OVERDUE";
};

export type PaymentsSummary = {
  collected: number;
  paidCount: number;
  payingMembers: number;
};

export type PaymentsListResult = {
  rows: PaymentRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  summary: PaymentsSummary;
  status: PaymentStatusFilter;
  method: string | null;
  range: PaymentRange;
  sort: PaymentSort;
  dir: "asc" | "desc";
  q: string;
};

function normStatus(v: string | undefined): PaymentStatusFilter {
  return (PAYMENT_STATUS_FILTERS as readonly string[]).includes(v ?? "")
    ? (v as PaymentStatusFilter)
    : "all";
}
function normSort(v: string | undefined): PaymentSort {
  return (PAYMENT_SORTS as readonly string[]).includes(v ?? "") ? (v as PaymentSort) : "date";
}
function normMethod(v: string | undefined): string | null {
  return (METHODS as readonly string[]).includes(v ?? "") ? (v as string) : null;
}
function normRange(v: string | undefined): PaymentRange {
  return (PAYMENT_RANGES as readonly string[]).includes(v ?? "") ? (v as PaymentRange) : "all";
}

// Date bounds for a preset range, computed on the period's dueDate (UTC).
function rangeBounds(range: PaymentRange, now = new Date()): { start: Date; end: Date } | null {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  switch (range) {
    case "this_month":
      return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 1)) };
    case "last_month":
      return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
    case "this_year":
      return { start: new Date(Date.UTC(y, 0, 1)), end: new Date(Date.UTC(y + 1, 0, 1)) };
    case "all":
    default:
      return null;
  }
}

// Shared where-builder so the page query, the summary aggregates, and the CSV
// export all filter identically.
export function buildPaymentsWhere(params: PaymentsListParams): Prisma.PaymentWhereInput {
  const q = params.q?.trim() ?? "";
  const status = normStatus(params.status);
  const method = normMethod(params.method);
  const range = normRange(params.range);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const overdueCutoff = new Date(todayStart);
  overdueCutoff.setUTCDate(overdueCutoff.getUTCDate() - OVERDUE_GRACE_DAYS);

  const and: Prisma.PaymentWhereInput[] = [];

  if (q) {
    and.push({
      member: {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { publicId: { contains: q, mode: "insensitive" } },
        ],
      },
    });
  }
  if (method) {
    and.push({ method: method as Prisma.PaymentWhereInput["method"] });
  }
  switch (status) {
    case "paid":
      and.push({ status: "PAID" });
      break;
    case "unpaid":
      and.push({ status: { not: "PAID" } });
      break;
    case "overdue":
      and.push({ status: { not: "PAID" }, dueDate: { lte: overdueCutoff } });
      break;
    case "all":
    default:
      break;
  }
  const bounds = rangeBounds(range);
  if (bounds) {
    and.push({ dueDate: { gte: bounds.start, lt: bounds.end } });
  }

  return and.length > 0 ? { AND: and } : {};
}

const ROW_INCLUDE = {
  member: { select: { id: true, name: true, publicId: true, phone: true, planType: true } },
} satisfies Prisma.PaymentInclude;

type RawPaymentRow = Prisma.PaymentGetPayload<{ include: typeof ROW_INCLUDE }>;

function toRow(p: RawPaymentRow): PaymentRow {
  return {
    id: p.id,
    memberId: p.member.id,
    memberName: p.member.name,
    publicId: p.member.publicId,
    phone: p.member.phone,
    period: p.period,
    periodLabel: formatPeriodLabel(p.dueDate, p.member.planType),
    dueDate: p.dueDate,
    paidAt: p.paidAt,
    method: p.method,
    amount: centsToNumber(toCents(p.amount)),
    eff: computeEffectiveStatus(p),
  };
}

function orderByFor(
  sort: PaymentSort,
  dir: "asc" | "desc"
): Prisma.PaymentOrderByWithRelationInput {
  if (sort === "name") return { member: { name: dir } };
  if (sort === "amount") return { amount: dir };
  return { dueDate: dir };
}

async function summarize(db: ReturnType<typeof forGym>, where: Prisma.PaymentWhereInput) {
  // Collected = paid amounts within the active filter.
  const paidWhere: Prisma.PaymentWhereInput = { AND: [where, { status: "PAID" }] };
  const [agg, payers] = await Promise.all([
    db.payment.aggregate({ where: paidWhere, _sum: { amount: true }, _count: true }),
    db.payment.groupBy({ by: ["memberId"], where: paidWhere }),
  ]);
  return {
    collected: centsToNumber(toCents(agg._sum.amount)),
    paidCount: agg._count,
    payingMembers: payers.length,
  };
}

export async function getPaymentsList(
  gymId: string,
  params: PaymentsListParams
): Promise<PaymentsListResult> {
  const db = forGym(gymId);

  const q = params.q?.trim() ?? "";
  const status = normStatus(params.status);
  const method = normMethod(params.method);
  const range = normRange(params.range);
  const sort = normSort(params.sort);
  const dir: "asc" | "desc" =
    params.dir === "asc" ? "asc" : params.dir === "desc" ? "desc" : sort === "date" ? "desc" : "asc";
  const pageRaw = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const where = buildPaymentsWhere(params);

  const [total, summary] = await Promise.all([
    db.payment.count({ where }),
    summarize(db, where),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAYMENTS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const payments = await db.payment.findMany({
    where,
    orderBy: orderByFor(sort, dir),
    skip: (safePage - 1) * PAYMENTS_PAGE_SIZE,
    take: PAYMENTS_PAGE_SIZE,
    include: ROW_INCLUDE,
  });

  return {
    rows: payments.map(toRow),
    total,
    page: safePage,
    pageSize: PAYMENTS_PAGE_SIZE,
    totalPages,
    summary,
    status,
    method,
    range,
    sort,
    dir,
    q,
  };
}

// All matching rows (no pagination) for CSV export.
export async function getPaymentsForExport(
  gymId: string,
  params: PaymentsListParams
): Promise<PaymentRow[]> {
  const db = forGym(gymId);
  const where = buildPaymentsWhere(params);
  const sort = normSort(params.sort);
  const dir: "asc" | "desc" =
    params.dir === "asc" ? "asc" : params.dir === "desc" ? "desc" : sort === "date" ? "desc" : "asc";
  const payments = await db.payment.findMany({
    where,
    orderBy: orderByFor(sort, dir),
    take: 5000,
    include: ROW_INCLUDE,
  });
  return payments.map(toRow);
}
