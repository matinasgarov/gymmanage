"use server";

import { revalidatePath } from "next/cache";
import { getOwnerDb } from "@/lib/dal";
import { addPlanDays } from "@/lib/members";
import { ensurePendingPayments, periodKey } from "@/lib/payments";

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
    include: { member: { select: { planType: true, expiryDate: true } } },
  });
  if (!payment || payment.status === "PAID") return;

  // Orphaned payment (member was deleted, history kept): just record the
  // payment — there is no member to advance.
  const member = payment.member;

  // Renewal: advance the membership to cover the period just paid. Monotonic
  // (max) so paying an older period never shrinks expiry and freeze-extended
  // expiry is preserved.
  const newExpiry = member
    ? (() => {
        const periodEnd = addPlanDays(payment.dueDate, member.planType);
        return periodEnd > member.expiryDate ? periodEnd : member.expiryDate;
      })()
    : null;

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
    if (payment.memberId && newExpiry) {
      await tx.member.update({
        where: { id: payment.memberId },
        data: { status: "ACTIVE", expiryDate: newExpiry },
      });
    }
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

// Renew a membership: record one period's payment and extend expiry by one plan
// length. If the member is behind, this pays their earliest unpaid period; if
// they are fully paid up, it creates the next period in advance. Expiry advances
// monotonically so freeze-extended expiry is never lost.
export async function renewMembership(memberId: string, formData: FormData) {
  const { user, db } = await getOwnerDb();
  const method = formData.get("method");
  if (!isMethod(method)) return;

  const member = await db.member.findFirst({
    where: { id: memberId },
    select: { id: true, planType: true, planPrice: true, startDate: true, expiryDate: true },
  });
  if (!member) return;

  // Make sure elapsed periods exist before we pick the earliest unpaid one.
  await ensurePendingPayments(memberId);

  const unpaid = await db.payment.findFirst({
    where: { memberId, status: { not: "PAID" } },
    orderBy: { dueDate: "asc" },
  });

  let dueDate: Date;
  if (unpaid) {
    dueDate = unpaid.dueDate;
  } else {
    // Fully paid up — pay the next period in advance (one plan length past the
    // latest recorded period, or past startDate if there are none yet).
    const latest = await db.payment.findFirst({
      where: { memberId },
      orderBy: { dueDate: "desc" },
      select: { dueDate: true },
    });
    dueDate = addPlanDays(latest ? latest.dueDate : member.startDate, member.planType);
  }

  // Access resets to exactly one plan length from the renewal moment. We do NOT
  // compound onto the previous cycle or the start-date grid: an early renewer
  // forfeits the days they had left and gets a fresh full period from today.
  // (The payment row above stays period-anchored for billing accounting.)
  const newExpiry = addPlanDays(new Date(), member.planType);

  await db.$transaction(async (tx) => {
    if (unpaid) {
      await tx.payment.update({
        where: { id: unpaid.id },
        data: { status: "PAID", method, paidAt: new Date(), recordedById: user.id },
      });
    } else {
      await tx.payment.create({
        data: {
          memberId,
          gymId: user.gymId,
          amount: member.planPrice,
          period: periodKey(dueDate),
          dueDate,
          status: "PAID",
          method,
          paidAt: new Date(),
          recordedById: user.id,
        },
      });
    }
    await tx.member.update({
      where: { id: memberId },
      data: { status: "ACTIVE", expiryDate: newExpiry },
    });
    await tx.auditLog.create({
      data: {
        gymId: user.gymId,
        actorId: user.id,
        action: "member.renew",
        entityType: "Member",
        entityId: memberId,
        payload: {
          period: periodKey(dueDate),
          amount: member.planPrice.toString(),
          method,
          newExpiry: newExpiry.toISOString().slice(0, 10),
        },
      },
    });
  });

  revalidatePath(`/members/${memberId}`);
  revalidatePath("/members");
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
