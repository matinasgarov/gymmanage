import { describe, it, expect } from "vitest";
import { getMonthlyRecap, getRecapTrend } from "@/lib/recap";
import { REASON } from "@/lib/scan-reasons";
import {
  prisma,
  seedGym,
  seedMember,
  seedPayment,
} from "../../../test/integration/helpers";

const DAY = 24 * 60 * 60 * 1000;

// A fixed month with no DST/edge surprises: June 2026 (month index 5).
const Y = 2026;
const M = 5;
const inMonth = new Date(Date.UTC(Y, M, 10, 12, 0, 0)); // 2026-06-10

async function reminderSent(gymId: string, paymentId: string, at: Date) {
  await prisma.auditLog.create({
    data: {
      gymId,
      action: "reminder.sent",
      entityType: "Payment",
      entityId: paymentId,
      createdAt: at,
    },
  });
}

async function denied(gymId: string, memberId: string, reason: string, at: Date) {
  await prisma.checkIn.create({
    data: { gymId, memberId, result: "DENIED", deniedReason: reason, scannedAt: at },
  });
}

describe("recap — getMonthlyRecap", () => {
  it("counts a payment paid within 14 days after a reminder as reminder-collected", async () => {
    const gym = await seedGym();
    const member = await seedMember(gym.id);
    const paidAt = new Date(inMonth);
    const p = await seedPayment(gym.id, member.id, {
      status: "PAID",
      amount: "50",
      paidAt,
      dueDate: new Date(paidAt.getTime() - 20 * DAY),
    });
    await reminderSent(gym.id, p.id, new Date(paidAt.getTime() - 3 * DAY));

    const recap = await getMonthlyRecap(gym.id, Y, M);

    expect(recap.reminderCollected).toBe(50);
    expect(recap.totalRevenue).toBe(50);
  });

  it("excludes a payment whose reminder was more than 14 days before payment", async () => {
    const gym = await seedGym();
    const member = await seedMember(gym.id);
    const paidAt = new Date(inMonth);
    const p = await seedPayment(gym.id, member.id, {
      status: "PAID",
      amount: "50",
      paidAt,
      dueDate: new Date(paidAt.getTime() - 30 * DAY),
    });
    await reminderSent(gym.id, p.id, new Date(paidAt.getTime() - 20 * DAY));

    const recap = await getMonthlyRecap(gym.id, Y, M);

    expect(recap.reminderCollected).toBe(0); // outside window
    expect(recap.totalRevenue).toBe(50); // still real revenue
  });

  it("buckets denials: revenue denials counted, sharing signal separate, frozen ignored", async () => {
    const gym = await seedGym();
    const member = await seedMember(gym.id);
    await denied(gym.id, member.id, REASON.PAYMENT, inMonth);
    await denied(gym.id, member.id, REASON.EXPIRED, inMonth);
    await denied(gym.id, member.id, REASON.already_entered, inMonth);
    await denied(gym.id, member.id, REASON.FROZEN, inMonth);

    const recap = await getMonthlyRecap(gym.id, Y, M);

    expect(recap.blockedCount).toBe(2); // PAYMENT + EXPIRED
    expect(recap.sharingSignalCount).toBe(1); // already_entered
    const payment = recap.blockedByReason.find((b) => b.reason === REASON.PAYMENT);
    expect(payment?.count).toBe(1);
  });

  it("ignores events outside the requested month", async () => {
    const gym = await seedGym();
    const member = await seedMember(gym.id);
    const lastMonth = new Date(Date.UTC(Y, M - 1, 15));
    await seedPayment(gym.id, member.id, { status: "PAID", amount: "50", paidAt: lastMonth, dueDate: lastMonth });
    await denied(gym.id, member.id, REASON.PAYMENT, lastMonth);

    const recap = await getMonthlyRecap(gym.id, Y, M);

    expect(recap.totalRevenue).toBe(0);
    expect(recap.blockedCount).toBe(0);
  });
});

describe("recap — getRecapTrend", () => {
  it("returns one point per month, oldest first, ending on the requested month", async () => {
    const gym = await seedGym();
    const member = await seedMember(gym.id);
    // A payment paid in the requested month, reminded 2 days before.
    const paidAt = new Date(Date.UTC(2026, 5, 10));
    const p = await seedPayment(gym.id, member.id, {
      status: "PAID", amount: "50", paidAt, dueDate: new Date(paidAt.getTime() - 10 * DAY),
    });
    await reminderSent(gym.id, p.id, new Date(paidAt.getTime() - 2 * DAY));

    const trend = await getRecapTrend(gym.id, 2026, 5, 6);

    expect(trend).toHaveLength(6);
    expect(trend[0]).toMatchObject({ year: 2026, month: 0 }); // Jan 2026 (5 months back)
    expect(trend[5]).toMatchObject({ year: 2026, month: 5 }); // requested month last
    expect(trend[5].reminderCollected).toBe(50);
    expect(trend[0].reminderCollected).toBe(0);
  });
});
