import { Megaphone } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getOwnerDb } from "@/lib/dal";
import { ReminderQueue, type ReminderItem } from "@/components/reminder-queue";

const OVERDUE_GRACE_DAYS = 5;

export default async function RemindersPage() {
  const { user, db } = await getOwnerDb();
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - OVERDUE_GRACE_DAYS);

  const payments = await db.payment.findMany({
    where: {
      status: { not: "PAID" },
      dueDate: { lte: cutoff },
      member: { status: { notIn: ["CANCELLED", "FROZEN"] } },
    },
    orderBy: { dueDate: "asc" },
    include: {
      member: { select: { id: true, name: true, phone: true, publicId: true } },
    },
    take: 200,
  });

  const items: ReminderItem[] = payments.map((p) => ({
    paymentId: p.id,
    period: p.period,
    amount: Number(p.amount.toString()),
    daysLate: Math.floor((Date.now() - p.dueDate.getTime()) / (1000 * 60 * 60 * 24)),
    member: p.member,
  }));

  return (
    <AppShell>
      <PageHeader
        title="Xatırlatma növbəsi"
        subtitle="Hər kəsə bir-bir WhatsApp göndərin. Göndərdikcə növbəti açılacaq."
        icon={Megaphone}
        tone="dark"
      />
      <div className="px-4 lg:px-8 py-6">
        <ReminderQueue
          items={items}
          gymName={user.gym.name}
          reminderTemplate={user.gym.waReminderTemplate}
        />
      </div>
    </AppShell>
  );
}
