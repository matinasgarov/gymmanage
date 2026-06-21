import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { TwoFactorPurpose } from "@/generated/prisma/enums";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

// 6-digit zero-padded code. crypto.randomInt is uniform over [0, 1_000_000).
export function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

// Only the hash is stored — the raw code lives only in the email.
export function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

// Issue a fresh code for (user, purpose), invalidating any prior unconsumed
// codes for that purpose so only the latest email works. Returns the raw code
// so the caller can email it.
export async function issueTwoFactorCode(
  userId: string,
  purpose: TwoFactorPurpose
): Promise<string> {
  await prisma.twoFactorCode.deleteMany({
    where: { userId, purpose, consumedAt: null },
  });
  const code = generateOtp();
  await prisma.twoFactorCode.create({
    data: {
      userId,
      purpose,
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  return code;
}

// Verify and consume a code. A wrong code increments `attempts`; once the cap is
// hit the code is dead even if the right value arrives later (forces re-issue).
// Constant-ish behaviour: always returns boolean, never reveals which check failed.
export async function verifyTwoFactorCode(
  userId: string,
  purpose: TwoFactorPurpose,
  code: string
): Promise<boolean> {
  const row = await prisma.twoFactorCode.findFirst({
    where: { userId, purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return false;
  if (row.expiresAt < new Date()) return false;
  if (row.attempts >= MAX_ATTEMPTS) return false;

  const matches = crypto.timingSafeEqual(
    Buffer.from(hashOtp(code)),
    Buffer.from(row.codeHash)
  );
  if (!matches) {
    await prisma.twoFactorCode.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    return false;
  }

  await prisma.twoFactorCode.update({
    where: { id: row.id },
    data: { consumedAt: new Date() },
  });
  return true;
}
