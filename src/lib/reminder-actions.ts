"use server";

import { getOwnerDb } from "@/lib/dal";

export async function recordReminderSent(paymentId: string, channel: "whatsapp" | "skip") {
  const { user, db } = await getOwnerDb();
  const payment = await db.payment.findFirst({
    where: { id: paymentId },
    select: { id: true, memberId: true, period: true },
  });
  if (!payment) return { ok: false };

  await db.auditLog.create({
    data: {
      gymId: user.gymId,
      actorId: user.id,
      action: channel === "skip" ? "reminder.skip" : "reminder.sent",
      entityType: "Payment",
      entityId: payment.id,
      payload: {
        memberId: payment.memberId,
        period: payment.period,
        channel,
      },
    },
  });

  return { ok: true };
}
