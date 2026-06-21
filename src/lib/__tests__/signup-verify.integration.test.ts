import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import { signup, verifySignup } from "@/lib/auth-actions";
import { readSession } from "@/lib/session";
import { hashOtp } from "@/lib/two-factor";
import { RedirectError } from "../../../test/integration/stubs/next-navigation";
import { __setHeader } from "../../../test/integration/stubs/next-headers";
import { prisma, seedGym, seedOwner, formData } from "../../../test/integration/helpers";

async function expectRedirect(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof RedirectError) return e.url;
    throw e;
  }
  throw new Error("expected a redirect, but none was thrown");
}

const validForm = (email: string) =>
  formData({
    gymName: "Iron Gym",
    ownerName: "Eli Mammadov",
    phone: "+994501234567",
    email,
    password: "passw0rd",
  });

describe("signup — email verification gate", () => {
  it("does NOT create a user until the code is verified", async () => {
    __setHeader("x-forwarded-for", "10.1.1.1");
    const email = `new-${crypto.randomUUID()}@test.az`;

    const url = await expectRedirect(() => signup(undefined, validForm(email)));

    expect(url).toBe("/signup/verify");
    // No real account yet — only a pending row.
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    expect(await prisma.gym.count()).toBe(0);
    const pending = await prisma.pendingSignup.findUnique({ where: { email } });
    expect(pending).not.toBeNull();
    // No session granted at this stage.
    expect(await readSession()).toBeNull();
  });

  it("creates the gym + owner and logs in once the correct code is entered", async () => {
    __setHeader("x-forwarded-for", "10.1.1.2");
    const email = `ok-${crypto.randomUUID()}@test.az`;
    await expectRedirect(() => signup(undefined, validForm(email)));

    // Inject a known code (the real code is emailed; tests can't read it).
    await prisma.pendingSignup.update({
      where: { email },
      data: { codeHash: hashOtp("123456") },
    });

    const url = await expectRedirect(() => verifySignup(undefined, formData({ code: "123456" })));

    expect(url).toBe("/dashboard");
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.role).toBe("OWNER");
    expect(await prisma.pendingSignup.findUnique({ where: { email } })).toBeNull();
    const session = await readSession();
    expect(session?.userId).toBe(user?.id);
  });

  it("rejects a wrong code and creates no account", async () => {
    __setHeader("x-forwarded-for", "10.1.1.3");
    const email = `bad-${crypto.randomUUID()}@test.az`;
    await expectRedirect(() => signup(undefined, validForm(email)));
    await prisma.pendingSignup.update({
      where: { email },
      data: { codeHash: hashOtp("123456") },
    });

    const res = await verifySignup(undefined, formData({ code: "000000" }));
    expect(res?.message).toBeTruthy();
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it("refuses to start signup for an already-registered email", async () => {
    const gym = await seedGym();
    const existing = await seedOwner(gym.id, {
      email: `taken-${crypto.randomUUID()}@test.az`,
      passwordHash: await bcrypt.hash("x", 10),
    });

    const res = await signup(undefined, validForm(existing.email));
    expect(res?.errors?.email).toBeTruthy();
    // No pending row created for a taken email.
    expect(await prisma.pendingSignup.findUnique({ where: { email: existing.email } })).toBeNull();
  });

  it("fails verification when there is no pending signup", async () => {
    const res = await verifySignup(undefined, formData({ code: "123456" }));
    expect(res?.message).toBeTruthy();
  });
});
