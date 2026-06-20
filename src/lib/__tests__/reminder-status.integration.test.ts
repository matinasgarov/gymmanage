import { describe, it, expect } from "vitest";
import { remindedPaymentIds } from "@/lib/reminder-status";
import { prisma, seedGym, seedMember, seedPayment } from "../../../test/integration/helpers";

describe("reminder-status — remindedPaymentIds", () => {
  it("returns the set of payment ids that already had a reminder sent", async () => {
    const gym = await seedGym();
    const member = await seedMember(gym.id);
    const reminded = await seedPayment(gym.id, member.id, { status: "PENDING" });
    const notReminded = await seedPayment(gym.id, member.id, {
      status: "PENDING",
      period: "2026-07",
      dueDate: new Date("2026-07-01"),
    });
    await prisma.auditLog.create({
      data: {
        gymId: gym.id,
        action: "reminder.sent",
        entityType: "Payment",
        entityId: reminded.id,
      },
    });

    const ids = await remindedPaymentIds(gym.id, [reminded.id, notReminded.id]);

    expect(ids.has(reminded.id)).toBe(true);
    expect(ids.has(notReminded.id)).toBe(false);
  });

  it("returns an empty set when given no ids", async () => {
    const gym = await seedGym();
    const ids = await remindedPaymentIds(gym.id, []);
    expect(ids.size).toBe(0);
  });
});
