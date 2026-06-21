import crypto from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/session";

// ── Safety: never let the truncate run against a non-test database ───────
const DB_URL = process.env.DATABASE_URL ?? "";
if (!DB_URL.includes("gympass_test")) {
  throw new Error(
    `Integration tests refuse to run: DATABASE_URL is not the test DB (got "${DB_URL}").`
  );
}

// Order does not matter with CASCADE, but list every table so a new model fails
// loudly here (unknown table) rather than silently leaking rows between tests.
const TABLES = [
  "Gym",
  "User",
  "Member",
  "Payment",
  "CheckIn",
  "Freeze",
  "AuditLog",
  "Lead",
  "VisitorPass",
  "ScannerDevice",
  "PlanPrice",
  "PasswordResetToken",
  "TwoFactorCode",
  "RateLimit",
  "PendingSignup",
];

export async function resetDb() {
  const list = TABLES.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export function randomSecret(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function seedGym(overrides: Partial<Prisma.GymUncheckedCreateInput> = {}) {
  return prisma.gym.create({
    data: {
      name: "Test Gym",
      ownerName: "Owner",
      phone: "+994500000000",
      ...overrides,
    },
  });
}

export function seedOwner(
  gymId: string,
  overrides: Partial<Prisma.UserUncheckedCreateInput> = {}
) {
  return prisma.user.create({
    data: {
      gymId,
      email: `owner-${crypto.randomUUID()}@test.az`,
      passwordHash: "x",
      name: "Owner",
      role: "OWNER",
      ...overrides,
    },
  });
}

export function seedMember(
  gymId: string,
  overrides: Partial<Prisma.MemberUncheckedCreateInput> = {}
) {
  return prisma.member.create({
    data: {
      gymId,
      publicId: `M-${crypto.randomInt(10000, 99999)}`,
      name: "Test Member",
      phone: "+994551112233",
      planType: "MONTHLY_UNLIMITED",
      planPrice: "50",
      startDate: new Date(),
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      qrSecret: randomSecret(),
      ...overrides,
    },
  });
}

export function seedPayment(
  gymId: string,
  memberId: string,
  overrides: Partial<Prisma.PaymentUncheckedCreateInput> = {}
) {
  const dueDate = (overrides.dueDate as Date) ?? new Date();
  return prisma.payment.create({
    data: {
      gymId,
      memberId,
      amount: "50",
      period: new Date(dueDate).toISOString().slice(0, 10),
      dueDate,
      status: "PENDING",
      ...overrides,
    },
  });
}

// Mint a real session cookie (signed JWT) for the given user.
export async function login(user: {
  id: string;
  gymId: string;
  role: "OWNER" | "STAFF";
}) {
  await createSession({ userId: user.id, gymId: user.gymId, role: user.role });
}

export function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

export { prisma };
