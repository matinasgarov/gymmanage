"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma, type Tx } from "@/lib/prisma";
import {
  createSession,
  destroySession,
  createPending2FA,
  readPending2FA,
  destroyPending2FA,
  createPendingSignup,
  readPendingSignup,
  destroyPendingSignup,
} from "@/lib/session";
import { isLocale } from "@/lib/i18n";
import { LOCALE_COOKIE } from "@/lib/i18n-server";
import { signupSchema, loginSchema } from "@/lib/validators";
import { generateToken, hashToken, makeExpiry, RESET_TTL_HOURS, INVITE_TTL_HOURS } from "@/lib/tokens";
import { sendResetEmail, sendInviteEmail, sendTwoFactorCode, sendSignupCode } from "@/lib/email";
import { getCurrentUser, getOwnerDb } from "@/lib/dal";
import { rateLimit, resetRateLimit, getClientIp } from "@/lib/rate-limit";
import {
  issueTwoFactorCode,
  verifyTwoFactorCode,
  generateOtp,
  hashOtp,
} from "@/lib/two-factor";
import { revalidatePath } from "next/cache";

const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// Persist the user's saved UI language into the locale cookie so the app loads
// in their preference immediately after auth.
async function applyLocaleCookie(locale: string | null) {
  if (!isLocale(locale)) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}

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

  // Throttle signup-code requests so the same email/IP can't be spammed.
  const ip = await getClientIp();
  const ipLimit = await rateLimit(`signup:ip:${ip}`, 10, HOUR_MS);
  const emailLimit = await rateLimit(`signup:email:${email}`, 5, HOUR_MS);
  if (!ipLimit.allowed || !emailLimit.allowed) {
    return { message: "Çox sayda cəhd. Bir az sonra yenidən yoxlayın." };
  }

  // Do NOT create the account yet. Stash the would-be account in PendingSignup
  // and email a code; the Gym/User rows are only created once the code is
  // verified (verifySignup), so nobody can register an email they don't own.
  const passwordHash = await bcrypt.hash(password, 10);
  const code = generateOtp();
  const data = {
    gymName,
    ownerName,
    phone,
    passwordHash,
    codeHash: hashOtp(code),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    attempts: 0,
  };
  await prisma.pendingSignup.upsert({
    where: { email },
    create: { email, ...data },
    update: data,
  });
  await sendSignupCode(email, code);
  await createPendingSignup(email);
  redirect("/signup/verify");
}

// Second signup step: verify the emailed code, then actually create the gym +
// owner and log them in. The pending cookie names which email is being verified.
export async function verifySignup(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const pending = await readPendingSignup();
  if (!pending) {
    return { message: "Təsdiq vaxtı bitdi. Yenidən qeydiyyatdan keçin." };
  }

  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return { errors: { code: ["6 rəqəmli kod daxil edin"] } };
  }

  const ip = await getClientIp();
  const limit = await rateLimit(`signup-verify:${pending.email}:${ip}`, 10, FIFTEEN_MIN_MS);
  if (!limit.allowed) {
    return { message: "Çox sayda cəhd. Bir az sonra yenidən yoxlayın." };
  }

  const row = await prisma.pendingSignup.findUnique({ where: { email: pending.email } });
  if (!row || row.expiresAt < new Date() || row.attempts >= 5) {
    return { message: "Kod yanlış və ya vaxtı keçib." };
  }
  if (hashOtp(code) !== row.codeHash) {
    await prisma.pendingSignup.update({
      where: { email: pending.email },
      data: { attempts: { increment: 1 } },
    });
    return { message: "Kod yanlış və ya vaxtı keçib." };
  }

  // Guard against a race where the email got registered between steps.
  const already = await prisma.user.findUnique({ where: { email: pending.email } });
  if (already) {
    await prisma.pendingSignup.delete({ where: { email: pending.email } });
    await destroyPendingSignup();
    return { message: "Bu email artıq qeydiyyatdan keçib." };
  }

  const user = await prisma.$transaction(async (tx: Tx) => {
    const gym = await tx.gym.create({
      data: { name: row.gymName, ownerName: row.ownerName, phone: row.phone },
    });
    const owner = await tx.user.create({
      data: {
        gymId: gym.id,
        email: pending.email,
        passwordHash: row.passwordHash,
        name: row.ownerName,
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
        payload: { gymName: row.gymName, ownerEmail: pending.email },
      },
    });
    await tx.pendingSignup.delete({ where: { email: pending.email } });
    return owner;
  });

  await createSession({ userId: user.id, gymId: user.gymId, role: "OWNER" });
  await destroyPendingSignup();
  redirect("/dashboard");
}

// Re-issue and re-send the signup verification code for the pending email.
export async function resendSignupCode(): Promise<FormState> {
  const pending = await readPendingSignup();
  if (!pending) {
    return { message: "Təsdiq vaxtı bitdi. Yenidən qeydiyyatdan keçin." };
  }
  const ip = await getClientIp();
  const limit = await rateLimit(`signup-resend:${pending.email}:${ip}`, 3, FIFTEEN_MIN_MS);
  if (!limit.allowed) {
    return { message: "Çox sayda kod istəyi. Bir az sonra yenidən cəhd edin." };
  }
  const row = await prisma.pendingSignup.findUnique({ where: { email: pending.email } });
  if (!row) {
    return { message: "Təsdiq vaxtı bitdi. Yenidən qeydiyyatdan keçin." };
  }
  const code = generateOtp();
  await prisma.pendingSignup.update({
    where: { email: pending.email },
    data: {
      codeHash: hashOtp(code),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      attempts: 0,
    },
  });
  await sendSignupCode(pending.email, code);
  return { message: "Yeni kod göndərildi." };
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

  // Throttle brute force: cap per-IP and per-email attempts in a 15-min window.
  const ip = await getClientIp();
  const ipLimit = await rateLimit(`login:ip:${ip}`, 20, FIFTEEN_MIN_MS);
  const emailLimit = await rateLimit(`login:email:${email}`, 5, FIFTEEN_MIN_MS);
  if (!ipLimit.allowed || !emailLimit.allowed) {
    return { message: "Çox sayda cəhd. Bir az sonra yenidən yoxlayın." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    return { message: "Email və ya şifrə yanlışdır" };
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return { message: "Email və ya şifrə yanlışdır" };
  }

  // Password is correct → clear this email's failure counter so the user isn't
  // penalised by earlier typos. (IP bucket is left to expire on its own.)
  await resetRateLimit(`login:email:${email}`);

  // Opt-in 2FA: defer the real session until the emailed code is verified.
  if (user.twoFactorEnabled) {
    const code = await issueTwoFactorCode(user.id, "LOGIN");
    await sendTwoFactorCode(user.email, code);
    await createPending2FA(user.id);
    redirect("/login/verify");
  }

  await createSession({
    userId: user.id,
    gymId: user.gymId,
    role: user.role,
  });
  // Carry the user's saved language into the cookie so the UI loads in their
  // preference immediately (the cookie is the per-request source of truth).
  await applyLocaleCookie(user.locale);
  redirect(user.role === "STAFF" ? "/scan" : "/dashboard");
}

// Second login step: verify the emailed 6-digit code held against the pending
// 2FA cookie, then mint the real session. No password is re-checked here — the
// pending cookie already asserts the password step passed for this userId.
export async function verifyTwoFactor(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const pending = await readPending2FA();
  if (!pending) {
    return { message: "Doğrulama vaxtı bitdi. Yenidən daxil olun." };
  }

  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return { errors: { code: ["6 rəqəmli kod daxil edin"] } };
  }

  // Cap code-guessing per (user, IP) on top of the per-code attempt counter.
  const ip = await getClientIp();
  const limit = await rateLimit(`2fa:${pending.userId}:${ip}`, 10, FIFTEEN_MIN_MS);
  if (!limit.allowed) {
    return { message: "Çox sayda cəhd. Bir az sonra yenidən yoxlayın." };
  }

  const ok = await verifyTwoFactorCode(pending.userId, "LOGIN", code);
  if (!ok) {
    return { message: "Kod yanlış və ya vaxtı keçib." };
  }

  const user = await prisma.user.findUnique({ where: { id: pending.userId } });
  if (!user || !user.active) {
    await destroyPending2FA();
    return { message: "Hesab aktiv deyil." };
  }

  await createSession({ userId: user.id, gymId: user.gymId, role: user.role });
  await destroyPending2FA();
  await applyLocaleCookie(user.locale);
  redirect(user.role === "STAFF" ? "/scan" : "/dashboard");
}

// Re-issue and re-send a login code for the current pending 2FA challenge.
export async function resendTwoFactor(): Promise<FormState> {
  const pending = await readPending2FA();
  if (!pending) {
    return { message: "Doğrulama vaxtı bitdi. Yenidən daxil olun." };
  }
  const ip = await getClientIp();
  const limit = await rateLimit(`2fa-resend:${pending.userId}:${ip}`, 3, FIFTEEN_MIN_MS);
  if (!limit.allowed) {
    return { message: "Çox sayda kod istəyi. Bir az sonra yenidən cəhd edin." };
  }
  const user = await prisma.user.findUnique({ where: { id: pending.userId } });
  if (!user || !user.active) {
    return { message: "Hesab aktiv deyil." };
  }
  const code = await issueTwoFactorCode(user.id, "LOGIN");
  await sendTwoFactorCode(user.email, code);
  return { message: "Yeni kod göndərildi." };
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

  // Throttle reset requests to prevent email-bombing a victim / abusing the
  // mail quota. Same generic success message regardless of outcome.
  const ip = await getClientIp();
  const ipLimit = await rateLimit(`pwreset:ip:${ip}`, 10, HOUR_MS);
  const emailLimit = await rateLimit(`pwreset:email:${email}`, 3, HOUR_MS);
  if (!ipLimit.allowed || !emailLimit.allowed) {
    return { message: "Əgər bu email qeydiyyatdadırsa, sıfırlama linki göndərildi." };
  }

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

// ── Two-factor enrollment (opt-in, per logged-in user) ──────────────────

// Step 1 of enabling 2FA: email the user a verification code. Proves they can
// receive mail at their address before we flip the flag.
export async function startEnableTwoFactor(): Promise<FormState> {
  const user = await getCurrentUser();
  if (user.twoFactorEnabled) {
    return { message: "İki mərhələli doğrulama artıq aktivdir." };
  }
  const ip = await getClientIp();
  const limit = await rateLimit(`2fa-enable:${user.id}:${ip}`, 5, HOUR_MS);
  if (!limit.allowed) {
    return { message: "Çox sayda kod istəyi. Bir az sonra yenidən cəhd edin." };
  }
  const code = await issueTwoFactorCode(user.id, "ENABLE");
  await sendTwoFactorCode(user.email, code);
  return { message: "Təsdiq kodu emailinizə göndərildi." };
}

// Step 2 of enabling 2FA: verify the emailed ENABLE code, then flip the flag.
export async function confirmEnableTwoFactor(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getCurrentUser();
  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return { errors: { code: ["6 rəqəmli kod daxil edin"] } };
  }
  const ok = await verifyTwoFactorCode(user.id, "ENABLE", code);
  if (!ok) {
    return { message: "Kod yanlış və ya vaxtı keçib." };
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: true },
  });
  await prisma.auditLog.create({
    data: {
      gymId: user.gymId,
      actorId: user.id,
      action: "user.2fa_enabled",
      entityType: "User",
      entityId: user.id,
    },
  });
  revalidatePath("/settings");
  return { message: "İki mərhələli doğrulama aktivləşdirildi." };
}

// Disable 2FA. Re-checks the current password so a walk-up attacker on an open
// session can't quietly strip the second factor.
export async function disableTwoFactor(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await getCurrentUser();
  const password = String(formData.get("password") ?? "");

  const full = await prisma.user.findUnique({ where: { id: user.id } });
  if (!full) {
    return { message: "Xəta baş verdi." };
  }
  const ok = await bcrypt.compare(password, full.passwordHash);
  if (!ok) {
    return { errors: { password: ["Şifrə yanlışdır"] } };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: false },
  });
  await prisma.twoFactorCode.deleteMany({ where: { userId: user.id } });
  await prisma.auditLog.create({
    data: {
      gymId: user.gymId,
      actorId: user.id,
      action: "user.2fa_disabled",
      entityType: "User",
      entityId: user.id,
    },
  });
  revalidatePath("/settings");
  return { message: "İki mərhələli doğrulama söndürüldü." };
}
