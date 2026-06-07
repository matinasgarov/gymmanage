import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { forGym } from "@/lib/tenant";
import { PLAN_TYPES } from "@/config/gym-plans";

// Keep in sync with the dashboard's overdue definition so the two pages never
// disagree about who owes money.
const OVERDUE_GRACE_DAYS = 5;
export const MEMBERS_PAGE_SIZE = 25;

export const MEMBER_SORTS = ["expiry", "name", "joined"] as const;
export type MemberSort = (typeof MEMBER_SORTS)[number];

export const MEMBER_STATUS_FILTERS = [
  "all",
  "active",
  "overdue",
  "expiring",
  "expired",
  "frozen",
] as const;
export type MemberStatusFilter = (typeof MEMBER_STATUS_FILTERS)[number];

const PLAN_VALUES = PLAN_TYPES;

export type MembersListParams = {
  q?: string;
  status?: string;
  plan?: string;
  sort?: string;
  dir?: string;
  page?: string;
};

export type MemberRow = {
  id: string;
  name: string;
  publicId: string;
  phone: string;
  photoUrl: string | null;
  status: string;
  planType: string;
  planPrice: number;
  expiryDate: Date;
  isOverdue: boolean;
  lastCheckInAt: Date | null;
};

export type MembersListResult = {
  rows: MemberRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  // Normalized, validated params echoed back so the page can build links/highlight
  // active filters without re-parsing the raw searchParams.
  status: MemberStatusFilter;
  plan: string | null;
  sort: MemberSort;
  dir: "asc" | "desc";
  q: string;
};

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function normStatus(v: string | undefined): MemberStatusFilter {
  return (MEMBER_STATUS_FILTERS as readonly string[]).includes(v ?? "")
    ? (v as MemberStatusFilter)
    : "all";
}
function normSort(v: string | undefined): MemberSort {
  return (MEMBER_SORTS as readonly string[]).includes(v ?? "") ? (v as MemberSort) : "expiry";
}
function normPlan(v: string | undefined): string | null {
  return (PLAN_VALUES as readonly string[]).includes(v ?? "") ? (v as string) : null;
}

export async function getMembersList(
  gymId: string,
  params: MembersListParams
): Promise<MembersListResult> {
  const db = forGym(gymId);

  const q = params.q?.trim() ?? "";
  const status = normStatus(params.status);
  const plan = normPlan(params.plan);
  const sort = normSort(params.sort);
  // Expiry defaults to ascending (soonest first); everything else defaults asc too.
  const dir: "asc" | "desc" = params.dir === "desc" ? "desc" : "asc";
  const pageRaw = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const now = new Date();
  const todayStart = startOfDayUTC(now);
  const weekAhead = addDays(todayStart, 7);
  const overdueCutoff = addDays(todayStart, -OVERDUE_GRACE_DAYS);

  // Build the where-clause from filters. All filtering is DB-side so pagination
  // is correct across pages.
  const and: Prisma.MemberWhereInput[] = [];

  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { publicId: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (plan) {
    and.push({ planType: plan as Prisma.MemberWhereInput["planType"] });
  }

  switch (status) {
    case "overdue":
      and.push({
        status: { notIn: ["CANCELLED", "FROZEN"] },
        payments: { some: { status: { not: "PAID" }, dueDate: { lte: overdueCutoff } } },
      });
      break;
    case "expiring":
      and.push({ status: "ACTIVE", expiryDate: { gte: todayStart, lte: weekAhead } });
      break;
    case "expired":
      // Matches effectiveMemberStatus === EXPIRED: lapsed, not explicitly
      // cancelled or frozen.
      and.push({ status: { notIn: ["CANCELLED", "FROZEN"] }, expiryDate: { lt: todayStart } });
      break;
    case "active":
      // Exclude lapsed members so the chip matches the derived "Aktiv" badge
      // (stored status stays ACTIVE after expiry; expiryDate is the truth).
      and.push({ status: "ACTIVE", expiryDate: { gte: todayStart } });
      break;
    case "frozen":
      and.push({ status: "FROZEN" });
      break;
    case "all":
    default:
      break;
  }

  const where: Prisma.MemberWhereInput = and.length > 0 ? { AND: and } : {};

  const orderBy: Prisma.MemberOrderByWithRelationInput =
    sort === "name"
      ? { name: dir }
      : sort === "joined"
        ? { createdAt: dir }
        : { expiryDate: dir };

  const total = await db.member.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / MEMBERS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const members = await db.member.findMany({
    where,
    orderBy,
    skip: (safePage - 1) * MEMBERS_PAGE_SIZE,
    take: MEMBERS_PAGE_SIZE,
    select: {
      id: true,
      name: true,
      publicId: true,
      phone: true,
      photoUrl: true,
      status: true,
      planType: true,
      planPrice: true,
      expiryDate: true,
    },
  });

  const ids = members.map((m) => m.id);

  // Per-page signal queries: who on this page is overdue, and their last check-in.
  const [overduePayments, lastCheckIns] =
    ids.length === 0
      ? [[], []]
      : await Promise.all([
          db.payment.findMany({
            where: {
              memberId: { in: ids },
              status: { not: "PAID" },
              dueDate: { lte: overdueCutoff },
            },
            select: { memberId: true },
          }),
          db.checkIn.groupBy({
            by: ["memberId"],
            where: { memberId: { in: ids }, result: "GRANTED" },
            _max: { scannedAt: true },
          }),
        ]);

  const overdueIds = new Set(overduePayments.map((p) => p.memberId));
  const lastCheckInById = new Map<string, Date | null>();
  for (const row of lastCheckIns) {
    if (row.memberId) lastCheckInById.set(row.memberId, row._max.scannedAt);
  }

  const rows: MemberRow[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    publicId: m.publicId,
    phone: m.phone,
    photoUrl: m.photoUrl,
    status: m.status,
    planType: m.planType,
    planPrice: Number(m.planPrice.toString()),
    expiryDate: m.expiryDate,
    // Overdue badge is meaningful only for members who aren't cancelled/frozen.
    isOverdue:
      overdueIds.has(m.id) && m.status !== "CANCELLED" && m.status !== "FROZEN",
    lastCheckInAt: lastCheckInById.get(m.id) ?? null,
  }));

  return {
    rows,
    total,
    page: safePage,
    pageSize: MEMBERS_PAGE_SIZE,
    totalPages,
    status,
    plan,
    sort,
    dir,
    q,
  };
}
