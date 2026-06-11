import { Megaphone } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getOwnerDb } from "@/lib/dal";
import { getT } from "@/lib/i18n-server";
import { ReminderQueue, type ReminderItem } from "@/components/reminder-queue";
import { OVERDUE_GRACE_DAYS } from "@/lib/payments";
import { centsToNumber, sumCents } from "@/lib/money";

export default async function RemindersPage() {
  const { user, db } = await getOwnerDb();
  const t = await getT();
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekAhead = new Date(today);
  weekAhead.setUTCDate(weekAhead.getUTCDate() + 7);

  // Groups 1+2: every unpaid payment due so far (overdue AND within-grace).
  const unpaid = await db.payment.findMany({
    where: {
      status: { not: "PAID" },
      paidAt: null,
      dueDate: { lte: now },
      member: { status: { notIn: ["CANCELLED", "FROZEN"] } },
    },
    orderBy: { dueDate: "asc" },
    include: {
      member: { select: { id: true, name: true, phone: true, publicId: true } },
    },
    take: 200,
  });
  const withMember = unpaid.filter(
    (p): p is typeof p & { member: NonNullable<(typeof p)["member"]> } => p.member !== null
  );

  const paymentItems: ReminderItem[] = withMember.map((p) => {
    const daysLate = Math.floor((today.getTime() - p.dueDate.getTime()) / 86_400_000);
    return {
      group: daysLate >= OVERDUE_GRACE_DAYS ? ("overdue" as const) : ("dueNow" as const),
      paymentId: p.id,
      period: p.period,
      amount: Number(p.amount.toString()),
      daysLate,
      member: p.member,
    };
  });

  // Group 3: expiring within 7 days with no open debt (debtors are in groups 1–2).
  const debtorIds = [...new Set(withMember.map((p) => p.member.id))];
  const expiring = await db.member.findMany({
    where: {
      status: "ACTIVE",
      expiryDate: { gte: today, lte: weekAhead },
      id: { notIn: debtorIds },
    },
    orderBy: { expiryDate: "asc" },
    select: { id: true, name: true, phone: true, publicId: true, expiryDate: true },
    take: 100,
  });
  const expiringItems: ReminderItem[] = expiring.map((m) => ({
    group: "expiring" as const,
    daysLeft: Math.max(0, Math.ceil((m.expiryDate.getTime() - today.getTime()) / 86_400_000)),
    expiryDate: m.expiryDate.toISOString().slice(0, 10),
    member: { id: m.id, name: m.name, phone: m.phone, publicId: m.publicId },
  }));

  const items: ReminderItem[] = [
    ...paymentItems.filter((i) => i.group === "overdue"),
    ...paymentItems.filter((i) => i.group === "dueNow"),
    ...expiringItems,
  ];
  const summary = {
    amount: centsToNumber(sumCents(paymentItems.map((i) => i.amount))),
    people: new Set(paymentItems.map((i) => i.member.id)).size,
  };

  return (
    <AppShell>
      <PageHeader
        title={t("reminders.title")}
        subtitle={t("reminders.subtitle")}
        icon={Megaphone}
        tone="dark"
      />
      <div className="px-4 lg:px-8 py-6">
        <ReminderQueue
          items={items}
          gymName={user.gym.name}
          reminderTemplate={user.gym.waReminderTemplate}
          expiringTemplate={user.gym.waExpiringTemplate}
          summary={summary}
        />
      </div>
    </AppShell>
  );
}
