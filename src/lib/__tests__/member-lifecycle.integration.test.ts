import { describe, it, expect } from "vitest";
import {
  createMember,
  freezeMember,
  cancelMember,
  deleteMember,
} from "@/lib/member-actions";
import { RedirectError } from "../../../test/integration/stubs/next-navigation";
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

async function ownerCtx() {
  const gym = await seedGym();
  const owner = await seedOwner(gym.id);
  await login(owner);
  return { gym, owner };
}

describe("member-lifecycle — createMember", () => {
  it("creates a member + first pending payment + audit row, then redirects", async () => {
    const { gym } = await ownerCtx();

    let thrown: unknown;
    try {
      await createMember(
        undefined,
        formData({
          name: "Yeni Üzv",
          phone: "+994551234567",
          email: "",
          planType: "MONTHLY_UNLIMITED",
          planPrice: "60",
          startDate: "2026-06-01",
          notes: "",
        })
      );
    } catch (e) {
      thrown = e;
    }

    const member = await prisma.member.findFirst({ where: { gymId: gym.id } });
    expect(member).not.toBeNull();
    expect(member!.name).toBe("Yeni Üzv");
    expect(member!.publicId).toBe("M-00001");

    // Success path redirects to the new member's page.
    expect(thrown).toBeInstanceOf(RedirectError);
    expect((thrown as RedirectError).url).toBe(`/members/${member!.id}`);

    const payment = await prisma.payment.findFirst({ where: { memberId: member!.id } });
    expect(payment?.status).toBe("PENDING");

    const audit = await prisma.auditLog.count({
      where: { action: "member.create", entityId: member!.id },
    });
    expect(audit).toBe(1);
  });

  it("returns field errors and persists nothing for invalid input", async () => {
    const { gym } = await ownerCtx();

    const state = await createMember(
      undefined,
      formData({
        name: "x", // too short
        phone: "12345", // wrong format
        email: "",
        planType: "MONTHLY_UNLIMITED",
        planPrice: "-5", // not positive
        startDate: "2026-06-01",
        notes: "",
      })
    );

    expect(state?.errors).toBeDefined();
    const count = await prisma.member.count({ where: { gymId: gym.id } });
    expect(count).toBe(0);
  });
});

describe("member-lifecycle — freeze", () => {
  it("sets FROZEN, records the freeze, extends expiry, and audits", async () => {
    const { gym } = await ownerCtx();
    const start = new Date();
    const member = await seedMember(gym.id, {
      startDate: start,
      expiryDate: new Date(start.getTime() + 30 * DAY),
    });
    const originalExpiry = member.expiryDate.getTime();

    await freezeMember(
      member.id,
      formData({
        startDate: start.toISOString().slice(0, 10),
        endDate: new Date(start.getTime() + 7 * DAY).toISOString().slice(0, 10),
        reason: "Səfər",
      })
    );

    const m = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(m.status).toBe("FROZEN");
    expect(m.expiryDate.getTime()).toBeGreaterThan(originalExpiry);

    const freeze = await prisma.freeze.count({ where: { memberId: member.id } });
    expect(freeze).toBe(1);
    const audit = await prisma.auditLog.count({
      where: { action: "member.freeze", entityId: member.id },
    });
    expect(audit).toBe(1);
  });
});

describe("member-lifecycle — cancel", () => {
  it("sets CANCELLED with reason/note and audits", async () => {
    const { gym } = await ownerCtx();
    const member = await seedMember(gym.id);

    await cancelMember(member.id, formData({ reason: "MOVED", note: "Şəhəri tərk etdi" }));

    const m = await prisma.member.findUniqueOrThrow({ where: { id: member.id } });
    expect(m.status).toBe("CANCELLED");
    expect(m.cancelReason).toBe("MOVED");
    expect(m.cancelledAt).not.toBeNull();

    const audit = await prisma.auditLog.count({
      where: { action: "member.cancel", entityId: member.id },
    });
    expect(audit).toBe(1);
  });
});

describe("member-lifecycle — delete", () => {
  async function deleteOrThrow(memberId: string, fields: Record<string, string>) {
    try {
      await deleteMember(memberId, formData(fields));
    } catch (e) {
      if (!(e instanceof RedirectError)) throw e;
    }
  }

  it("keeps paid payments by default — detaches them with a name snapshot", async () => {
    const { gym } = await ownerCtx();
    const member = await seedMember(gym.id, { name: "Silinən Üzv" });
    const payment = await seedPayment(gym.id, member.id, {
      status: "PAID",
      paidAt: new Date(),
      method: "CASH",
    });

    await deleteOrThrow(member.id, { confirmName: "Silinən Üzv", deletePayments: "false" });

    expect(await prisma.member.findUnique({ where: { id: member.id } })).toBeNull();
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(p.memberId).toBeNull(); // detached, not deleted
    expect(p.memberName).toBe("Silinən Üzv"); // snapshot preserved for reports
    expect(p.status).toBe("PAID");
  });

  it("deletes payments too when the admin opts in", async () => {
    const { gym } = await ownerCtx();
    const member = await seedMember(gym.id, { name: "Tam Sil" });
    const payment = await seedPayment(gym.id, member.id, {
      status: "PAID",
      paidAt: new Date(),
      method: "CASH",
    });

    await deleteOrThrow(member.id, { confirmName: "Tam Sil", deletePayments: "true" });

    expect(await prisma.member.findUnique({ where: { id: member.id } })).toBeNull();
    expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toBeNull();
  });

  it("refuses to delete when the typed name does not match", async () => {
    const { gym } = await ownerCtx();
    const member = await seedMember(gym.id, { name: "Qorunan" });

    await deleteOrThrow(member.id, { confirmName: "yanlış", deletePayments: "false" });

    expect(await prisma.member.findUnique({ where: { id: member.id } })).not.toBeNull();
  });
});
