"use server";

import { revalidatePath } from "next/cache";
import { getOwnerDb } from "@/lib/dal";

const VALID_METHODS = ["CASH", "CARD", "TRANSFER"] as const;
type Method = (typeof VALID_METHODS)[number];

function isMethod(v: unknown): v is Method {
  return typeof v === "string" && (VALID_METHODS as readonly string[]).includes(v);
}

export async function markPaymentPaid(paymentId: string, formData: FormData) {
  const { user, db } = await getOwnerDb();
  const method = formData.get("method");
  if (!isMethod(method)) return;

  const payment = await db.payment.findFirst({
    where: { id: paymentId },
  });
  if (!payment || payment.status === "PAID") return;

  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: "PAID",
        method,
        paidAt: new Date(),
        recordedById: user.id,
      },
    });
    await tx.member.update({
      where: { id: payment.memberId },
      data: { status: "ACTIVE" },
    });
    await tx.auditLog.create({
      data: {
        gymId: user.gymId,
        actorId: user.id,
        action: "payment.mark_paid",
        entityType: "Payment",
        entityId: paymentId,
        payload: {
          memberId: payment.memberId,
          period: payment.period,
          amount: payment.amount.toString(),
          method,
        },
      },
    });
  });

  revalidatePath(`/members/${payment.memberId}`);
  revalidatePath("/payments");
  revalidatePath("/dashboard");
}

export async function unmarkPayment(paymentId: string) {
  const { user, db } = await getOwnerDb();
  const payment = await db.payment.findFirst({
    where: { id: paymentId },
  });
  if (!payment || payment.status !== "PAID") return;

  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: paymentId },
      data: { status: "PENDING", method: null, paidAt: null, recordedById: null },
    });
    await tx.auditLog.create({
      data: {
        gymId: user.gymId,
        actorId: user.id,
        action: "payment.unmark",
        entityType: "Payment",
        entityId: paymentId,
        payload: {
          memberId: payment.memberId,
          period: payment.period,
          previousAmount: payment.amount.toString(),
        },
      },
    });
  });

  revalidatePath(`/members/${payment.memberId}`);
  revalidatePath("/payments");
}
