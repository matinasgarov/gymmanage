import { describe, it, expect } from "vitest";
import { verifyScan, overrideScan } from "@/lib/scan-actions";
import { signScanToken } from "@/lib/qr";
import {
  prisma,
  seedGym,
  seedOwner,
  seedMember,
  seedPayment,
  login,
} from "../../../test/integration/helpers";

const DAY = 24 * 60 * 60 * 1000;

// Reason strings come straight from scan-actions' REASON map.
const REASON = {
  payment: "Ödəniş gözlənilir",
  frozen: "Üzvlük dondurulub",
  invalid: "QR kodu etibarsızdır",
  alreadyIn: "Bu gün artıq giriş edilib",
  limitReached: "Aylıq giriş limiti dolub",
};

async function activeMember(unlimitedEntries = false) {
  const gym = await seedGym();
  const owner = await seedOwner(gym.id);
  const member = await seedMember(gym.id, {
    photoUrl: "/uploads/photo.jpg",
    unlimitedEntries,
  });
  // Current period is paid → passes the payment gate.
  await seedPayment(gym.id, member.id, {
    status: "PAID",
    paidAt: new Date(),
    method: "CASH",
    dueDate: new Date(),
  });
  await login(owner);
  return { gym, owner, member };
}

describe("scan-actions — verifyScan GRANTED", () => {
  it("grants entry for a valid token, returns the photo, and logs a GRANTED check-in", async () => {
    const { member } = await activeMember();
    const { token } = signScanToken(member.id, member.qrSecret);

    const res = await verifyScan(token);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.member.photoUrl).toBe("/uploads/photo.jpg");
      expect(res.checkInId).toBeTruthy();
    }
    const granted = await prisma.checkIn.count({
      where: { memberId: member.id, result: "GRANTED" },
    });
    expect(granted).toBe(1);
  });
});

describe("scan-actions — verifyScan DENIED", () => {
  it("denies a frozen membership and logs a DENIED check-in", async () => {
    const gym = await seedGym();
    const owner = await seedOwner(gym.id);
    const member = await seedMember(gym.id, { status: "FROZEN" });
    await login(owner);
    const { token } = signScanToken(member.id, member.qrSecret);

    const res = await verifyScan(token);

    expect(res).toMatchObject({ ok: false, reason: REASON.frozen, canOverride: true });
    const denied = await prisma.checkIn.count({
      where: { memberId: member.id, result: "DENIED" },
    });
    expect(denied).toBe(1);
  });

  it("denies when the current period is unpaid/overdue", async () => {
    const gym = await seedGym();
    const owner = await seedOwner(gym.id);
    // startDate 40 days ago → an elapsed, unpaid period exists (overdue).
    const member = await seedMember(gym.id, { startDate: new Date(Date.now() - 40 * DAY) });
    await login(owner);
    const { token } = signScanToken(member.id, member.qrSecret);

    const res = await verifyScan(token);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe(REASON.payment);
  });

  it("denies a tampered HMAC with a cryptographic error", async () => {
    const { member } = await activeMember();
    const { token } = signScanToken(member.id, member.qrSecret);
    const [id, win, mac] = token.split(".");
    const tampered = `${id}.${win}.${mac.slice(0, -1)}${mac.endsWith("A") ? "B" : "A"}`;

    const res = await verifyScan(tampered);
    expect(res).toMatchObject({ ok: false, reason: REASON.invalid });
  });
});

describe("scan-actions — once-per-day gate", () => {
  it("denies a second entry the same day for a normal member", async () => {
    const { member } = await activeMember(false);
    const { token } = signScanToken(member.id, member.qrSecret);

    const first = await verifyScan(token);
    const second = await verifyScan(token);

    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: false, reason: REASON.alreadyIn });
  });

  it("allows multiple entries for an unlimited-entries member", async () => {
    const { member } = await activeMember(true);
    const { token } = signScanToken(member.id, member.qrSecret);

    const first = await verifyScan(token);
    const second = await verifyScan(token);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  });
});

describe("scan-actions — monthly entry cap (per billing cycle)", () => {
  it("grants up to the cap then denies further entries this cycle", async () => {
    const gym = await seedGym();
    const owner = await seedOwner(gym.id);
    // 12-entries tier modelled as a 2-cap here; unlimitedEntries bypasses the
    // once-per-day gate so the cap is what actually limits same-day scans.
    const member = await seedMember(gym.id, {
      unlimitedEntries: true,
      monthlyEntryLimit: 2,
    });
    await seedPayment(gym.id, member.id, {
      status: "PAID",
      paidAt: new Date(),
      method: "CASH",
      dueDate: new Date(),
    });
    await login(owner);
    const { token } = signScanToken(member.id, member.qrSecret);

    const first = await verifyScan(token);
    const second = await verifyScan(token);
    const third = await verifyScan(token);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(third).toMatchObject({ ok: false, reason: REASON.limitReached });

    const granted = await prisma.checkIn.count({
      where: { memberId: member.id, result: "GRANTED" },
    });
    expect(granted).toBe(2);
  });
});

describe("scan-actions — owner override", () => {
  it("records a GRANTED override check-in and an audit row", async () => {
    const gym = await seedGym();
    const owner = await seedOwner(gym.id);
    const member = await seedMember(gym.id, { status: "FROZEN" });
    await login(owner);

    const res = await overrideScan(member.id, "Manual let-in");
    expect(res.ok).toBe(true);

    const checkIn = await prisma.checkIn.findFirst({
      where: { memberId: member.id, override: true },
    });
    expect(checkIn?.result).toBe("GRANTED");
    expect(checkIn?.overrideNote).toBe("Manual let-in");

    const audit = await prisma.auditLog.count({
      where: { action: "checkin.override", entityId: checkIn?.id },
    });
    expect(audit).toBe(1);
  });
});

describe("scan-actions — grace entry with debt", () => {
  it("grants with a debt payload when the current period is unpaid but within grace", async () => {
    const gym = await seedGym();
    const owner = await seedOwner(gym.id);
    // startDate 2 days ago → current period due 2 days ago: unpaid, within 5-day grace.
    const member = await seedMember(gym.id, { startDate: new Date(Date.now() - 2 * DAY) });
    await login(owner);
    const { token } = signScanToken(member.id, member.qrSecret);

    const res = await verifyScan(token);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.debt).toBeTruthy();
      expect(res.debt?.amount).toBeGreaterThan(0);
      expect(res.debt?.graceDaysLeft).toBeGreaterThan(0);
    }
    const granted = await prisma.checkIn.count({
      where: { memberId: member.id, result: "GRANTED" },
    });
    expect(granted).toBe(1);
  });

  it("denies when an older period is past grace even though the latest is within it", async () => {
    const gym = await seedGym();
    const owner = await seedOwner(gym.id);
    // startDate 32 days ago → two periods: one due 32 days ago (past grace),
    // one due 2 days ago (within grace). Any past-grace period denies.
    const member = await seedMember(gym.id, { startDate: new Date(Date.now() - 32 * DAY) });
    await login(owner);
    const { token } = signScanToken(member.id, member.qrSecret);

    const res = await verifyScan(token);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe(REASON.payment);
  });

  it("carries no debt payload when the current period is paid", async () => {
    const { member } = await activeMember();
    const { token } = signScanToken(member.id, member.qrSecret);

    const res = await verifyScan(token);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.debt).toBeUndefined();
  });
});
