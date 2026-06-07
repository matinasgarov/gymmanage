import { describe, it, expect } from "vitest";
import { markPaymentPaid, unmarkPayment, renewMembership } from "@/lib/payment-actions";
import {
  prisma,
  seedGym,
  seedOwner,
  seedMember,
  seedPayment,
  login,
  formData,
} from "../../../test/integration/helpers";

const DAY = 24 * 60 * 60 * 1000;

function daysApart(a: Date, b: Date) {
  return Math.round((a.getTime() - b.getTime()) / DAY);
}

describe("payment-actions — markPaymentPaid", () => {
  it("marks paid, extends expiry by one plan length, and writes an audit row", async () => {
    const gym = await seedGym();
    const owner = await seedOwner(gym.id);
    const today = new Date();
    const member = await seedMember(gym.id, { startDate: today, expiryDate: today });
    const payment = await seedPayment(gym.id, member.id, {
      status: "PENDING",
      dueDate: today,
    });
    await login(owner);

    await markPaymentPaid(payment.id, formData({ method: "CASH" }));

    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe("PAID");
    expect(updated.method).toBe("CASH");

    const m = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    // Expiry now covers the paid period: exactly one plan length past its due
    // date. Compare the two date-only columns (avoids time-of-day rounding).
    expect(daysApart(m.expiryDate, updated.dueDate)).toBe(30);
    expect(m.expiryDate.getTime()).toBeGreaterThan(today.getTime());

    const audit = await prisma.auditLog.count({
      where: { action: "payment.mark_paid", entityId: payment.id },
    });
    expect(audit).toBe(1);
  });
});

describe("payment-actions — renewMembership", () => {
  it("creates the next period paid in advance and advances expiry", async () => {
    const gym = await seedGym();
    const owner = await seedOwner(gym.id);
    const today = new Date();
    const member = await seedMember(gym.id, {
      startDate: today,
      expiryDate: new Date(today.getTime() + 10 * DAY),
    });
    // Already paid up for the current period.
    await seedPayment(gym.id, member.id, {
      status: "PAID",
      paidAt: today,
      method: "CASH",
      dueDate: today,
    });
    await login(owner);

    await renewMembership(member.id, formData({ method: "CARD" }));

    const payments = await prisma.payment.findMany({ where: { memberId: member.id } });
    expect(payments.length).toBe(2); // original + advance
    const advance = payments.find((p) => p.dueDate.getTime() > today.getTime());
    expect(advance?.status).toBe("PAID");
    expect(advance?.method).toBe("CARD");

    const m = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(m.expiryDate.getTime()).toBeGreaterThan(today.getTime() + 10 * DAY);

    const audit = await prisma.auditLog.count({
      where: { action: "member.renew", entityId: member.id },
    });
    expect(audit).toBe(1);
  });

  it("pays the earliest unpaid period when the member is behind", async () => {
    const gym = await seedGym();
    const owner = await seedOwner(gym.id);
    // 40 days ago → ensurePendingPayments will create overdue period rows.
    const member = await seedMember(gym.id, { startDate: new Date(Date.now() - 40 * DAY) });
    await login(owner);

    await renewMembership(member.id, formData({ method: "CASH" }));

    const paid = await prisma.payment.count({
      where: { memberId: member.id, status: "PAID" },
    });
    expect(paid).toBe(1); // the earliest unpaid period got marked paid
  });
});

describe("payment-actions — unmarkPayment", () => {
  it("reverts a paid payment back to pending", async () => {
    const gym = await seedGym();
    const owner = await seedOwner(gym.id);
    const member = await seedMember(gym.id);
    const payment = await seedPayment(gym.id, member.id, {
      status: "PAID",
      paidAt: new Date(),
      method: "CASH",
    });
    await login(owner);

    await unmarkPayment(payment.id);

    const updated = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updated.status).toBe("PENDING");
    expect(updated.paidAt).toBeNull();
    expect(updated.method).toBeNull();
  });
});
