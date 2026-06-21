import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import {
  login,
  verifyTwoFactor,
  startEnableTwoFactor,
  confirmEnableTwoFactor,
  disableTwoFactor,
} from "@/lib/auth-actions";
import { readSession, createPending2FA } from "@/lib/session";
import { issueTwoFactorCode } from "@/lib/two-factor";
import { RedirectError } from "../../../test/integration/stubs/next-navigation";
import { __setHeader } from "../../../test/integration/stubs/next-headers";
import {
  prisma,
  seedGym,
  seedOwner,
  formData,
} from "../../../test/integration/helpers";

async function seedUserWithPassword(
  gymId: string,
  password: string,
  overrides: Record<string, unknown> = {}
) {
  return seedOwner(gymId, {
    email: `u-${crypto.randomUUID()}@test.az`,
    passwordHash: await bcrypt.hash(password, 10),
    ...overrides,
  });
}

async function expectRedirect(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof RedirectError) return e.url;
    throw e;
  }
  throw new Error("expected a redirect, but none was thrown");
}

describe("login — without 2FA", () => {
  it("creates a session and redirects on correct credentials", async () => {
    const gym = await seedGym();
    const user = await seedUserWithPassword(gym.id, "passw0rd", { role: "OWNER" });

    const url = await expectRedirect(() =>
      login(undefined, formData({ email: user.email, password: "passw0rd" }))
    );

    expect(url).toBe("/dashboard");
    const session = await readSession();
    expect(session?.userId).toBe(user.id);
  });

  it("rejects a wrong password without a session", async () => {
    const gym = await seedGym();
    const user = await seedUserWithPassword(gym.id, "passw0rd");

    const res = await login(undefined, formData({ email: user.email, password: "wrong" }));
    expect(res?.message).toBeTruthy();
    expect(await readSession()).toBeNull();
  });
});

describe("login — rate limiting", () => {
  it("blocks after 5 failed attempts for the same email", async () => {
    __setHeader("x-forwarded-for", "10.0.0.1");
    const gym = await seedGym();
    const user = await seedUserWithPassword(gym.id, "passw0rd");

    for (let i = 0; i < 5; i++) {
      await login(undefined, formData({ email: user.email, password: "wrong" }));
    }
    // 6th attempt — even with the CORRECT password — is throttled.
    const res = await login(undefined, formData({ email: user.email, password: "passw0rd" }));
    expect(res?.message).toContain("Çox sayda");
    expect(await readSession()).toBeNull();
  });
});

describe("login — with 2FA enabled", () => {
  it("defers the session, issues a code, and redirects to the verify step", async () => {
    const gym = await seedGym();
    const user = await seedUserWithPassword(gym.id, "passw0rd", { twoFactorEnabled: true });

    const url = await expectRedirect(() =>
      login(undefined, formData({ email: user.email, password: "passw0rd" }))
    );

    expect(url).toBe("/login/verify");
    expect(await readSession()).toBeNull(); // no real session yet
    const code = await prisma.twoFactorCode.findFirst({
      where: { userId: user.id, purpose: "LOGIN" },
    });
    expect(code).not.toBeNull();
  });
});

describe("verifyTwoFactor", () => {
  it("creates the session on a correct code", async () => {
    const gym = await seedGym();
    const user = await seedUserWithPassword(gym.id, "passw0rd", { twoFactorEnabled: true });
    await createPending2FA(user.id);
    const code = await issueTwoFactorCode(user.id, "LOGIN");

    const url = await expectRedirect(() => verifyTwoFactor(undefined, formData({ code })));

    expect(url).toBe("/dashboard");
    const session = await readSession();
    expect(session?.userId).toBe(user.id);
  });

  it("rejects a wrong code and creates no session", async () => {
    const gym = await seedGym();
    const user = await seedUserWithPassword(gym.id, "passw0rd", { twoFactorEnabled: true });
    await createPending2FA(user.id);
    await issueTwoFactorCode(user.id, "LOGIN");

    const res = await verifyTwoFactor(undefined, formData({ code: "000000" }));
    expect(res?.message).toBeTruthy();
    expect(await readSession()).toBeNull();
  });

  it("fails when there is no pending challenge", async () => {
    const res = await verifyTwoFactor(undefined, formData({ code: "123456" }));
    expect(res?.message).toBeTruthy();
  });
});

describe("2FA enable/disable", () => {
  it("enables only after the emailed code is confirmed", async () => {
    const gym = await seedGym();
    const user = await seedUserWithPassword(gym.id, "passw0rd", { role: "OWNER" });
    // Authenticate the session that getCurrentUser reads.
    const { login: mintSession } = await import("../../../test/integration/helpers");
    await mintSession({ id: user.id, gymId: user.gymId, role: "OWNER" });

    await startEnableTwoFactor();
    const issued = await prisma.twoFactorCode.findFirst({
      where: { userId: user.id, purpose: "ENABLE" },
    });
    expect(issued).not.toBeNull();

    // Wrong code → not enabled.
    await confirmEnableTwoFactor(undefined, formData({ code: "000000" }));
    let fresh = await prisma.user.findUnique({ where: { id: user.id } });
    expect(fresh?.twoFactorEnabled).toBe(false);

    // Re-issue a known code and confirm.
    const code = await issueTwoFactorCode(user.id, "ENABLE");
    await confirmEnableTwoFactor(undefined, formData({ code }));
    fresh = await prisma.user.findUnique({ where: { id: user.id } });
    expect(fresh?.twoFactorEnabled).toBe(true);
  });

  it("disables only with the correct password", async () => {
    const gym = await seedGym();
    const user = await seedUserWithPassword(gym.id, "passw0rd", {
      role: "OWNER",
      twoFactorEnabled: true,
    });
    const { login: mintSession } = await import("../../../test/integration/helpers");
    await mintSession({ id: user.id, gymId: user.gymId, role: "OWNER" });

    const bad = await disableTwoFactor(undefined, formData({ password: "wrong" }));
    expect(bad?.errors?.password).toBeTruthy();
    let fresh = await prisma.user.findUnique({ where: { id: user.id } });
    expect(fresh?.twoFactorEnabled).toBe(true);

    await disableTwoFactor(undefined, formData({ password: "passw0rd" }));
    fresh = await prisma.user.findUnique({ where: { id: user.id } });
    expect(fresh?.twoFactorEnabled).toBe(false);
  });
});
