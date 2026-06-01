"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma, type Tx } from "@/lib/prisma";
import { createSession, destroySession } from "@/lib/session";
import { signupSchema, loginSchema } from "@/lib/validators";
import { generateToken, hashToken, makeExpiry, RESET_TTL_HOURS, INVITE_TTL_HOURS } from "@/lib/tokens";
import { sendResetEmail, sendInviteEmail } from "@/lib/email";
import { getOwnerDb } from "@/lib/dal";
import { revalidatePath } from "next/cache";

// Canonical origin for out-of-band links (password reset / staff invite). These
// links are emailed, so the origin MUST come from server-controlled config — never
// the request Host header, which an attacker can forge to poison the reset link
// (CWE-640). Set NEXTAUTH_URL to the canonical https URL in production.
function getOrigin(): string {
  return (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
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

const inviteStaffSchema = z.object({
  name: z.string().min(2, "Ad ən az 2 simvol olmalıdır").trim(),
  email: z.email("Düzgün email daxil edin").trim().toLowerCase(),
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
    const origin = getOrigin();
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
  if (
    !token ||
    token.kind !== "RESET" ||
    token.usedAt ||
    token.expiresAt < new Date() ||
    !token.user.active
  ) {
    // Reject resets for deactivated users — a token minted while active must
    // not let a since-deactivated account back in. (acceptInvite intentionally
    // does NOT check this: its job is to activate an invited, inactive user.)
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

// Owner-only. Creates an inactive STAFF user + INVITE token, emails the link.
export async function inviteStaff(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { user: owner } = await getOwnerDb();

  const parsed = inviteStaffSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }
  const { name, email } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { errors: { email: ["Bu email artıq istifadə olunur"] } };
  }

  const raw = generateToken();
  await prisma.$transaction(async (tx: Tx) => {
    const staff = await tx.user.create({
      data: {
        gymId: owner.gymId,
        email,
        name,
        role: "STAFF",
        active: false,
        passwordHash: "", // placeholder until invite accepted
      },
    });
    await tx.passwordResetToken.create({
      data: {
        userId: staff.id,
        tokenHash: hashToken(raw),
        kind: "INVITE",
        expiresAt: makeExpiry(INVITE_TTL_HOURS),
      },
    });
  });

  const origin = getOrigin();
  await sendInviteEmail(email, name, `${origin}/accept-invite?token=${raw}`);

  revalidatePath("/settings");
  return { message: `${name} dəvət olundu` };
}

// Owner-only. Toggle a staff member's active flag. Scoped to the owner's gym.
export async function setStaffActive(staffId: string, active: boolean) {
  const { user: owner } = await getOwnerDb();
  await prisma.user.updateMany({
    where: { id: staffId, gymId: owner.gymId, role: "STAFF" },
    data: { active },
  });
  revalidatePath("/settings");
}

// Owner-only. Permanently delete a staff account. The where-filter (gymId +
// role:"STAFF") is the guard: an owner can only delete their own gym's staff,
// never another owner nor themselves. Type-to-confirm is re-validated here so
// the guard is not merely client-side. Optional FKs on Payment/CheckIn/AuditLog/
// VisitorPass are SET NULL on delete, so historical rows survive (unattributed);
// PasswordResetToken rows cascade away.
export async function deleteStaff(staffId: string, formData: FormData) {
  const { user: owner } = await getOwnerDb();
  const typed = String(formData.get("confirmName") ?? "").trim();

  const staff = await prisma.user.findFirst({
    where: { id: staffId, gymId: owner.gymId, role: "STAFF" },
  });
  if (!staff) return;
  if (typed !== staff.name) return;

  await prisma.$transaction(async (tx: Tx) => {
    // Snapshot before the row vanishes — AuditLog references users by nullable
    // actorId, so this row survives (its actorId is the owner, not the deletee).
    await tx.auditLog.create({
      data: {
        gymId: owner.gymId,
        actorId: owner.id,
        action: "staff.delete",
        entityType: "User",
        entityId: staffId,
        payload: { name: staff.name, email: staff.email },
      },
    });
    await tx.user.delete({ where: { id: staffId } });
  });

  revalidatePath("/settings");
}

// Public. Validates an INVITE token, sets the password, activates the account.
export async function acceptInvite(
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
  if (!token || token.kind !== "INVITE" || token.usedAt || token.expiresAt < new Date()) {
    return { message: "Dəvət linki etibarsız və ya vaxtı keçib." };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.$transaction(async (tx: Tx) => {
    await tx.user.update({
      where: { id: token.userId },
      data: { passwordHash, active: true },
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
