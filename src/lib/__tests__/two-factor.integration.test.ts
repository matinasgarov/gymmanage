import { describe, it, expect } from "vitest";
import {
  issueTwoFactorCode,
  verifyTwoFactorCode,
  generateOtp,
} from "@/lib/two-factor";
import { prisma, seedGym, seedOwner } from "../../../test/integration/helpers";

describe("two-factor — OTP issue/verify", () => {
  it("generateOtp returns a 6-digit numeric string", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateOtp();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it("verifies the correct code once and consumes it", async () => {
    const gym = await seedGym();
    const user = await seedOwner(gym.id);
    const code = await issueTwoFactorCode(user.id, "LOGIN");

    const first = await verifyTwoFactorCode(user.id, "LOGIN", code);
    const second = await verifyTwoFactorCode(user.id, "LOGIN", code);

    expect(first).toBe(true);
    expect(second).toBe(false); // single-use
  });

  it("rejects a wrong code and counts the attempt", async () => {
    const gym = await seedGym();
    const user = await seedOwner(gym.id);
    await issueTwoFactorCode(user.id, "LOGIN");

    const ok = await verifyTwoFactorCode(user.id, "LOGIN", "000000");
    expect(ok).toBe(false);

    const row = await prisma.twoFactorCode.findFirst({ where: { userId: user.id } });
    expect(row?.attempts).toBe(1);
  });

  it("locks the code after 5 wrong attempts even if the right one arrives", async () => {
    const gym = await seedGym();
    const user = await seedOwner(gym.id);
    const code = await issueTwoFactorCode(user.id, "LOGIN");

    for (let i = 0; i < 5; i++) {
      await verifyTwoFactorCode(user.id, "LOGIN", "999999");
    }
    const afterLock = await verifyTwoFactorCode(user.id, "LOGIN", code);
    expect(afterLock).toBe(false);
  });

  it("rejects an expired code", async () => {
    const gym = await seedGym();
    const user = await seedOwner(gym.id);
    const code = await issueTwoFactorCode(user.id, "LOGIN");
    // Force-expire the issued code.
    await prisma.twoFactorCode.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const ok = await verifyTwoFactorCode(user.id, "LOGIN", code);
    expect(ok).toBe(false);
  });

  it("issuing a new code invalidates the previous one for the same purpose", async () => {
    const gym = await seedGym();
    const user = await seedOwner(gym.id);
    const oldCode = await issueTwoFactorCode(user.id, "LOGIN");
    const newCode = await issueTwoFactorCode(user.id, "LOGIN");

    expect(await verifyTwoFactorCode(user.id, "LOGIN", oldCode)).toBe(false);
    expect(await verifyTwoFactorCode(user.id, "LOGIN", newCode)).toBe(true);
  });

  it("keeps LOGIN and ENABLE purposes independent", async () => {
    const gym = await seedGym();
    const user = await seedOwner(gym.id);
    const loginCode = await issueTwoFactorCode(user.id, "LOGIN");
    await issueTwoFactorCode(user.id, "ENABLE");

    // LOGIN code must not satisfy an ENABLE check.
    expect(await verifyTwoFactorCode(user.id, "ENABLE", loginCode)).toBe(false);
    // …but still works for LOGIN.
    expect(await verifyTwoFactorCode(user.id, "LOGIN", loginCode)).toBe(true);
  });
});
