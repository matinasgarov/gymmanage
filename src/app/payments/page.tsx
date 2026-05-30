import Link from "next/link";
import { Receipt } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getGymDb } from "@/lib/dal";
import { formatAZN } from "@/lib/members";
import { computeEffectiveStatus } from "@/lib/payments";
import {
  PAYMENT_STATUS_COLOR as STATUS_COLOR,
  PAYMENT_STATUS_LABEL as STATUS_LABEL,
  PAY_METHOD_LABEL as PAY_METHOD,
} from "@/lib/labels";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { user, db } = await getGymDb();
  const { filter } = await searchParams;
  const onlyUnpaid = filter === "unpaid";

  const payments = await db.payment.findMany({
    where: {
      ...(onlyUnpaid ? { status: { not: "PAID" } } : {}),
    },
    orderBy: [{ paidAt: "desc" }, { dueDate: "desc" }],
    take: 100,
    include: { member: { select: { id: true, name: true, publicId: true } } },
  });

  return (
    <AppShell>
      <PageHeader
        title="Ödənişlər"
        subtitle={user.gym.name}
        icon={Receipt}
        tone="dark"
        tabs={
          <nav className="flex gap-1 -mb-px text-sm">
            <FilterTab href="/payments" active={!onlyUnpaid}>
              Hamısı
            </FilterTab>
            <FilterTab href="/payments?filter=unpaid" active={onlyUnpaid}>
              Ödənilməmiş
            </FilterTab>
          </nav>
        }
      />

      <div className="px-4 lg:px-8 py-6">
        {payments.length === 0 ? (
          <div className="card p-10 text-center">
            <Receipt className="w-8 h-8 text-[var(--muted)] mx-auto mb-2" />
            <p className="text-sm text-[var(--muted)]">Heç bir ödəniş yoxdur.</p>
          </div>
        ) : (
          <div className="card divide-y divide-[var(--border)]">
            {payments.map((p) => {
              const eff = computeEffectiveStatus(p);
              return (
                <Link
                  key={p.id}
                  href={`/members/${p.member.id}`}
                  className="px-4 py-3 flex items-center justify-between hover:bg-[var(--background)] transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{p.member.name}</div>
                    <div className="text-[11px] text-[var(--muted)]">
                      {p.member.publicId} · {p.period}
                      {p.paidAt && p.method ? ` · ${PAY_METHOD[p.method]}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm">{formatAZN(p.amount)}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_COLOR[eff]}`}>
                      {STATUS_LABEL[eff]}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function FilterTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`px-4 py-2.5 border-b-2 -mb-px transition-colors ${active
        ? "border-[var(--brand)] text-white"
        : "border-transparent text-white/60 hover:text-white"
        }`}
    >
      {children}
    </Link>
  );
}
