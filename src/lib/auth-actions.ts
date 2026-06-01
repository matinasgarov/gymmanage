"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma, type Tx } from "@/lib/prisma";
import { createSession, destroySession } from "@/lib/session";
import { signupSchema, loginSchema } from "@/lib/validators";
import { generateToken, hashToken, makeExpiry, RESET_TTL_HOURS } from "@/lib/tokens";
import { sendResetEmail } from "@/lib/email";

async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export type FormState = {
  errors?: Record<string, string[]>;
  message?: string;
} | undefined;

const emailOnlySchema = z.object({
  email: z.email("Düzgün email daxil edin").trim().toLowerCase(),
});

const newPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Şifrə ən az 8 simvol olmalıdır")
    .regex(/[a-zA-Z]/, "Şifrədə hərf olmalıdır")
    .regex(/[0-9]/, "Şifrədə rəqəm olmalıdır"),
});

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse({
    gymName: formData.get("gymName"),
    ownerName: formData.get("ownerName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const { gymName, ownerName, phone, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { errors: { email: ["Bu email artıq qeydiyyatdan keçib"] } };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.$transaction(async (tx: Tx) => {
    const gym = await tx.gym.create({
      data: { name: gymName, ownerName, phone },
    });

    const owner = await tx.user.create({
      data: {
        gymId: gym.id,
        email,
        passwordHash,
        name: ownerName,
        role: "OWNER",
      },
    });

    await tx.auditLog.create({
      data: {
        gymId: gym.id,
        actorId: owner.id,
        action: "gym.create",
        entityType: "Gym",
        entityId: gym.id,
        payload: { gymName, ownerEmail: email },
      },
    });

    return owner;
  });

  await createSession({ userId: user.id, gymId: user.gymId, role: "OWNER" });
  redirect("/dashboard");
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    return { message: "Email və ya şifrə yanlışdır" };
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return { message: "Email və ya şifrə yanlışdır" };
  }

  await createSession({
    userId: user.id,
    gymId: user.gymId,
    role: user.role,
  });
  redirect(user.role === "STAFF" ? "/scan" : "/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

// Public. Always returns the same success message — no user enumeration.
export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = emailOnlySchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }
  const { email } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && user.active) {
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, kind: "RESET", usedAt: null },
    });
    const raw = generateToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(raw),
        kind: "RESET",
        expiresAt: makeExpiry(RESET_TTL_HOURS),
      },
    });
    const origin = await getOrigin();
    await sendResetEmail(email, `${origin}/reset-password?token=${raw}`);
  }

  return { message: "Əgər bu email qeydiyyatdadırsa, sıfırlama linki göndərildi." };
}

// Public. Validates a RESET token, sets the new password, logs the user in.
export async function resetPassword(
  rawToken: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse({ password: formData.get("password") });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const token = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });
  if (!token || token.kind !== "RESET" || token.usedAt || token.expiresAt < new Date()) {
    return { message: "Link etibarsız və ya vaxtı keçib." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.$transaction(async (tx: Tx) => {
    await tx.user.update({
      where: { id: token.userId },
      data: { passwordHash },
    });
    await tx.passwordResetToken.update({
      where: { id: token.id },
      data: { usedAt: new Date() },
    });
  });

  await createSession({
    userId: token.user.id,
    gymId: token.user.gymId,
    role: token.user.role,
  });
  redirect(token.user.role === "STAFF" ? "/scan" : "/dashboard");
}
