# Staff Invite + Forgot Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let owners invite staff in-app (invite-by-email link) and give all users a self-service forgot-password flow, both backed by a single hashed-token model and Resend email.

**Architecture:** One `PasswordResetToken` Prisma model (kind = RESET | INVITE) stores `sha256(rawToken)` — the raw token only ever travels in the emailed URL. Public server actions (`requestPasswordReset`, `resetPassword`, `acceptInvite`) use the bare `prisma` client since the user is unauthenticated; owner-only actions (`inviteStaff`, `setStaffActive`) use `getOwnerDb()`. Email goes through a thin `src/lib/email.ts` wrapper over the Resend SDK.

**Tech Stack:** Next.js 16 (App Router, RSC, server actions), Prisma 6, zod v4, bcryptjs, jose sessions, Resend SDK, Tailwind.

> **Project testing reality:** This repo has **no test runner** — only `npm run typecheck` and `npm run lint`. Each task is verified by typecheck + lint clean on touched files, plus a runtime check where applicable. Do not add a test framework. Follow `AGENTS.md`: this is a modified Next.js — consult `node_modules/next/dist/docs/` before using any Next.js API you are unsure about.

---

## File Structure

### New files
- `src/lib/tokens.ts` — `generateToken`, `hashToken`, `makeExpiry` helpers (shared by invite + reset).
- `src/lib/email.ts` — `sendInviteEmail`, `sendResetEmail` (Resend wrapper, failures swallowed).
- `src/app/(auth)/forgot-password/page.tsx` + `forgot-form.tsx` — request a reset.
- `src/app/(auth)/reset-password/page.tsx` + `reset-form.tsx` — set a new password from a RESET token.
- `src/app/(auth)/accept-invite/page.tsx` + `accept-form.tsx` — set a password from an INVITE token.
- `src/components/settings/staff-card.tsx` — owner staff list + invite form.
- `src/components/settings/staff-invite-form.tsx` — client invite form (useActionState).
- `src/components/settings/staff-toggle-button.tsx` — client active/inactive toggle.

### Modified files
- `prisma/schema.prisma` — add `TokenKind` enum, `PasswordResetToken` model, `User.resetTokens` back-relation.
- `src/lib/auth-actions.ts` — add the five new actions.
- `src/app/(auth)/login/login-form.tsx` — add "Şifrəni unutdum?" link.
- `src/app/settings/page.tsx` — render `<StaffCard />`.
- `.env.example` (if present) / document `RESEND_API_KEY` + `RESEND_FROM`.

---

## Task 1: Schema — PasswordResetToken model + migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the `TokenKind` enum**

In `prisma/schema.prisma`, after the `LeadStatus` enum block (near line 66), add:

```prisma
enum TokenKind {
  RESET
  INVITE
}
```

- [ ] **Step 2: Add the `PasswordResetToken` model**

In `prisma/schema.prisma`, in the `// ─── Auth ───` section (after the `User` model, around line 209), add:

```prisma
model PasswordResetToken {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique // sha256(rawToken) — raw token never stored
  kind      TokenKind
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

- [ ] **Step 3: Add the back-relation to `User`**

In the `User` model's relation block (around line 202-206), add this line alongside the other relations:

```prisma
  resetTokens           PasswordResetToken[]
```

- [ ] **Step 4: Create and apply the migration**

Run:
```bash
npx prisma migrate dev --name add_password_reset_tokens
```
Expected: migration created under `prisma/migrations/<ts>_add_password_reset_tokens/`, applied to the dev DB, and the Prisma client regenerated into `src/generated/prisma/` with no error.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean (the new model/enum are now in the generated client).

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(auth): add PasswordResetToken model + TokenKind enum"
```

---

## Task 2: Token helpers — `src/lib/tokens.ts`

**Files:**
- Create: `src/lib/tokens.ts`

- [ ] **Step 1: Write the module**

Create `src/lib/tokens.ts`:

```ts
import "server-only";
import crypto from "node:crypto";

// Raw token sent in the emailed URL. 32 bytes → 43-char URL-safe string.
export function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

// Only the hash is stored — mirrors ScannerDevice.tokenHash (src/lib/device.ts).
export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function makeExpiry(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export const INVITE_TTL_HOURS = 48;
export const RESET_TTL_HOURS = 1;
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/tokens.ts
git commit -m "feat(auth): add token generate/hash/expiry helpers"
```

---

## Task 3: Email module — `src/lib/email.ts`

**Files:**
- Create: `src/lib/email.ts`
- Modify: `package.json` (add `resend` dependency)

- [ ] **Step 1: Install the Resend SDK**

Run:
```bash
npm install resend
```
Expected: `resend` added to `dependencies` in `package.json`.

- [ ] **Step 2: Write the email module**

Create `src/lib/email.ts`:

```ts
import "server-only";
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM ?? "noreply@example.com";

// Single shared client. If RESEND_API_KEY is unset (e.g. local dev), `resend`
// is null and sends are skipped with a warning — the token still exists, so the
// flow is testable by reading the URL from the server log.
const resend = apiKey ? new Resend(apiKey) : null;

async function send(to: string, subject: string, html: string) {
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY unset — skipping send to ${to}: ${subject}`);
    return;
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    // A failed email must not blow up the server action — the token row exists
    // and the owner/user can retry. Log and move on.
    console.error(`[email] failed to send to ${to}:`, err);
  }
}

export async function sendInviteEmail(to: string, name: string, inviteUrl: string) {
  await send(
    to,
    "GymPass — hesabınızı aktivləşdirin",
    `<p>Salam ${name},</p>
     <p>Sizə GymPass hesabı yaradıldı. Şifrənizi təyin etmək üçün aşağıdakı linkə keçin (link 48 saat etibarlıdır):</p>
     <p><a href="${inviteUrl}">${inviteUrl}</a></p>`
  );
}

export async function sendResetEmail(to: string, resetUrl: string) {
  await send(
    to,
    "GymPass — şifrə sıfırlama",
    `<p>Şifrənizi sıfırlamaq üçün aşağıdakı linkə keçin (link 1 saat etibarlıdır):</p>
     <p><a href="${resetUrl}">${resetUrl}</a></p>
     <p>Bu sorğunu siz etməmisinizsə, bu emaili nəzərə almayın.</p>`
  );
}
```

- [ ] **Step 3: Document the new env vars**

If `.env.example` exists, add:
```
RESEND_API_KEY=
RESEND_FROM=noreply@yourdomain.com
```
If it does not exist, skip — do NOT touch the real `.env` (gitignored, holds secrets).

- [ ] **Step 4: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email.ts package.json package-lock.json .env.example
git commit -m "feat(auth): add Resend email module for invite + reset"
```

---

## Task 4: Server action — `requestPasswordReset` + `resetPassword`

**Files:**
- Modify: `src/lib/auth-actions.ts`

- [ ] **Step 1: Add imports**

At the top of `src/lib/auth-actions.ts`, alongside the existing imports, add:

```ts
import { headers } from "next/headers";
import { generateToken, hashToken, makeExpiry, RESET_TTL_HOURS, INVITE_TTL_HOURS } from "@/lib/tokens";
import { sendResetEmail, sendInviteEmail } from "@/lib/email";
import { getOwnerDb } from "@/lib/dal";
```

(Keep the existing `prisma`, `Tx`, `createSession`, `bcrypt`, `z`, `redirect` imports.)

- [ ] **Step 2: Add an origin helper**

The emailed URL needs an absolute origin. Mirror the pattern in `src/app/members/[id]/page.tsx` (lines 60-63). Add near the top of `auth-actions.ts`, after the imports:

```ts
async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
```

- [ ] **Step 3: Add a reset-request schema**

After the existing `FormState` type, add:

```ts
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
```

- [ ] **Step 4: Implement `requestPasswordReset`**

Append to `src/lib/auth-actions.ts`:

```ts
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
    // Clear prior unused reset tokens so only the newest link works.
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
```

- [ ] **Step 5: Implement `resetPassword`**

Append:

```ts
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
```

- [ ] **Step 6: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth-actions.ts
git commit -m "feat(auth): add requestPasswordReset + resetPassword actions"
```

---

## Task 5: Server action — `inviteStaff` + `setStaffActive` + `acceptInvite`

**Files:**
- Modify: `src/lib/auth-actions.ts`

- [ ] **Step 1: Add an invite schema**

After the schemas added in Task 4, add:

```ts
const inviteStaffSchema = z.object({
  name: z.string().min(2, "Ad ən az 2 simvol olmalıdır").trim(),
  email: z.email("Düzgün email daxil edin").trim().toLowerCase(),
});
```

- [ ] **Step 2: Implement `inviteStaff`**

Append to `src/lib/auth-actions.ts`:

```ts
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

  const origin = await getOrigin();
  await sendInviteEmail(email, name, `${origin}/accept-invite?token=${raw}`);

  revalidatePath("/settings");
  return { message: `${name} dəvət olundu` };
}
```

> Note: `inviteStaff` uses the bare `prisma` client for the create (not `db` from
> `getOwnerDb`) because `User` and `PasswordResetToken` writes set `gymId` explicitly
> from `owner.gymId` — matching how `signup` creates users. `getOwnerDb()` is still
> called for the owner gate (redirects STAFF) and to read `owner.gymId`.

- [ ] **Step 3: Implement `setStaffActive`**

Append:

```ts
// Owner-only. Toggle a staff member's active flag. Scoped to the owner's gym.
export async function setStaffActive(staffId: string, active: boolean) {
  const { user: owner } = await getOwnerDb();
  await prisma.user.updateMany({
    where: { id: staffId, gymId: owner.gymId, role: "STAFF" },
    data: { active },
  });
  revalidatePath("/settings");
}
```

> `updateMany` with the `gymId` + `role: "STAFF"` filter is the tenant guard: an owner
> can never flip a user outside their gym, nor flip another owner.

- [ ] **Step 4: Implement `acceptInvite`**

Append:

```ts
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
```

- [ ] **Step 5: Add the `revalidatePath` import**

Ensure `src/lib/auth-actions.ts` imports `revalidatePath` (used by `inviteStaff`/`setStaffActive`). At the top:

```ts
import { revalidatePath } from "next/cache";
```

- [ ] **Step 6: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth-actions.ts
git commit -m "feat(auth): add inviteStaff, setStaffActive, acceptInvite actions"
```

---

## Task 6: Forgot-password page

**Files:**
- Create: `src/app/(auth)/forgot-password/page.tsx`
- Create: `src/app/(auth)/forgot-password/forgot-form.tsx`

- [ ] **Step 1: Write the client form**

Create `src/app/(auth)/forgot-password/forgot-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { requestPasswordReset, type FormState } from "@/lib/auth-actions";

const initial: FormState = undefined;

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  if (state?.message) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <p className="text-sm text-neutral-700">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4 bg-white p-6 rounded-lg shadow-sm border">
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="siz@example.com"
          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-black/20"
        />
        {state?.errors?.email?.[0] && (
          <p className="text-xs text-red-600 mt-1">{state.errors.email[0]}</p>
        )}
      </div>
      <button type="submit" disabled={pending} className="btn-brand w-full">
        {pending ? "Göndərilir…" : "Sıfırlama linki göndər"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Write the page**

Create `src/app/(auth)/forgot-password/page.tsx`:

```tsx
import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-1">Şifrəni unutmusunuz?</h1>
        <p className="text-sm text-neutral-600 mb-6">
          Email ünvanınızı daxil edin — sizə sıfırlama linki göndərəcəyik.
        </p>
        <ForgotForm />
        <p className="text-sm text-neutral-600 mt-4 text-center">
          <Link href="/login" className="text-blue-600 hover:underline">
            Girişə qayıt
          </Link>
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(auth)/forgot-password"
git commit -m "feat(auth): forgot-password page"
```

---

## Task 7: Reset-password page

**Files:**
- Create: `src/app/(auth)/reset-password/page.tsx`
- Create: `src/app/(auth)/reset-password/reset-form.tsx`

- [ ] **Step 1: Write the client form**

Create `src/app/(auth)/reset-password/reset-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { resetPassword, type FormState } from "@/lib/auth-actions";

const initial: FormState = undefined;

export function ResetForm({ token }: { token: string }) {
  const action = resetPassword.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="space-y-4 bg-white p-6 rounded-lg shadow-sm border">
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">
          Yeni şifrə
        </label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="Ən az 8 simvol"
          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-black/20"
        />
        {state?.errors?.password?.[0] && (
          <p className="text-xs text-red-600 mt-1">{state.errors.password[0]}</p>
        )}
      </div>
      {state?.message && <p className="text-sm text-red-600">{state.message}</p>}
      <button type="submit" disabled={pending} className="btn-brand w-full">
        {pending ? "Yenilənir…" : "Şifrəni yenilə"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Write the page**

Create `src/app/(auth)/reset-password/page.tsx`. The page reads `?token` from
`searchParams`. In this Next.js version `searchParams` is a Promise — await it (verify
against `node_modules/next/dist/docs/` if unsure).

```tsx
import Link from "next/link";
import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-1">Yeni şifrə təyin edin</h1>
        {token ? (
          <>
            <p className="text-sm text-neutral-600 mb-6">
              Hesabınız üçün yeni bir şifrə seçin.
            </p>
            <ResetForm token={token} />
          </>
        ) : (
          <p className="text-sm text-red-600 mb-6">
            Link etibarsızdır.{" "}
            <Link href="/forgot-password" className="text-blue-600 hover:underline">
              Yenidən cəhd edin
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(auth)/reset-password"
git commit -m "feat(auth): reset-password page"
```

---

## Task 8: Accept-invite page

**Files:**
- Create: `src/app/(auth)/accept-invite/page.tsx`
- Create: `src/app/(auth)/accept-invite/accept-form.tsx`

- [ ] **Step 1: Write the client form**

Create `src/app/(auth)/accept-invite/accept-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { acceptInvite, type FormState } from "@/lib/auth-actions";

const initial: FormState = undefined;

export function AcceptForm({ token }: { token: string }) {
  const action = acceptInvite.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="space-y-4 bg-white p-6 rounded-lg shadow-sm border">
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">
          Şifrə təyin edin
        </label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="Ən az 8 simvol"
          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-black/20"
        />
        {state?.errors?.password?.[0] && (
          <p className="text-xs text-red-600 mt-1">{state.errors.password[0]}</p>
        )}
      </div>
      {state?.message && <p className="text-sm text-red-600">{state.message}</p>}
      <button type="submit" disabled={pending} className="btn-brand w-full">
        {pending ? "Hazırlanır…" : "Hesabı aktivləşdir"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Write the page**

Create `src/app/(auth)/accept-invite/page.tsx`:

```tsx
import Link from "next/link";
import { AcceptForm } from "./accept-form";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-1">Xoş gəlmisiniz!</h1>
        {token ? (
          <>
            <p className="text-sm text-neutral-600 mb-6">
              Hesabınızı aktivləşdirmək üçün bir şifrə təyin edin.
            </p>
            <AcceptForm token={token} />
          </>
        ) : (
          <p className="text-sm text-red-600 mb-6">
            Dəvət linki etibarsızdır.{" "}
            <Link href="/login" className="text-blue-600 hover:underline">
              Girişə qayıt
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(auth)/accept-invite"
git commit -m "feat(auth): accept-invite page"
```

---

## Task 9: Login link to forgot-password

**Files:**
- Modify: `src/app/(auth)/login/login-form.tsx`

- [ ] **Step 1: Add the link**

In `src/app/(auth)/login/login-form.tsx`, add a `Link` import at the top:

```tsx
import Link from "next/link";
```

Then, directly after the password field's closing `</div>` (after line 41, before the `{state?.message && ...}` block), add:

```tsx
      <div className="text-right -mt-2">
        <Link href="/forgot-password" className="text-xs text-blue-600 hover:underline">
          Şifrəni unutdunuz?
        </Link>
      </div>
```

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(auth)/login/login-form.tsx"
git commit -m "feat(auth): forgot-password link on login form"
```

---

## Task 10: Staff management card in Settings

**Files:**
- Create: `src/components/settings/staff-card.tsx`
- Create: `src/components/settings/staff-invite-form.tsx`
- Create: `src/components/settings/staff-toggle-button.tsx`
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Write the invite form (client)**

Create `src/components/settings/staff-invite-form.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { inviteStaff, type FormState } from "@/lib/auth-actions";

const initial: FormState = undefined;

export function StaffInviteForm() {
  const [state, action, pending] = useActionState(inviteStaff, initial);

  return (
    <form action={action} className="flex flex-col sm:flex-row gap-2 sm:items-start">
      <div className="flex-1">
        <input
          name="name"
          placeholder="Ad Soyad"
          className="w-full px-3 py-2 border rounded-md text-sm"
        />
        {state?.errors?.name?.[0] && (
          <p className="text-xs text-red-600 mt-1">{state.errors.name[0]}</p>
        )}
      </div>
      <div className="flex-1">
        <input
          name="email"
          type="email"
          placeholder="email@example.com"
          className="w-full px-3 py-2 border rounded-md text-sm"
        />
        {state?.errors?.email?.[0] && (
          <p className="text-xs text-red-600 mt-1">{state.errors.email[0]}</p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="bg-black text-white rounded-full px-4 py-2 text-sm font-medium disabled:opacity-40"
      >
        {pending ? "Göndərilir…" : "İşçi əlavə et"}
      </button>
      {state?.message && (
        <p className="text-xs text-emerald-700 mt-2 sm:basis-full">{state.message}</p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Write the toggle button (client)**

Create `src/components/settings/staff-toggle-button.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { setStaffActive } from "@/lib/auth-actions";

export function StaffToggleButton({
  staffId,
  active,
}: {
  staffId: string;
  active: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <button
      onClick={() => start(() => setStaffActive(staffId, !active))}
      disabled={pending}
      className="text-xs underline text-[var(--muted)] disabled:opacity-40"
    >
      {active ? "Deaktiv et" : "Aktiv et"}
    </button>
  );
}
```

- [ ] **Step 3: Write the staff card (server)**

Create `src/components/settings/staff-card.tsx`:

```tsx
import { prisma } from "@/lib/prisma";
import { StaffInviteForm } from "./staff-invite-form";
import { StaffToggleButton } from "./staff-toggle-button";

export async function StaffCard({ gymId }: { gymId: string }) {
  const staff = await prisma.user.findMany({
    where: { gymId, role: "STAFF" },
    select: { id: true, name: true, email: true, active: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-4">
      {staff.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Hələ işçi yoxdur.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {staff.map((s) => (
            <li key={s.id} className="py-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-xs text-[var(--muted)]">{s.email}</div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    s.active
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-neutral-200 text-neutral-600"
                  }`}
                >
                  {s.active ? "Aktiv" : "Deaktiv"}
                </span>
                <StaffToggleButton staffId={s.id} active={s.active} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <StaffInviteForm />
    </div>
  );
}
```

- [ ] **Step 4: Render the card in Settings**

In `src/app/settings/page.tsx`, add the import near the other settings imports:

```tsx
import { StaffCard } from "@/components/settings/staff-card";
```

Then add a new `<Section>` inside the settings layout (after the profile section, before templates — match the existing `<Section title=...>` usage in the file):

```tsx
        <Section title="İşçilər">
          <p className="text-xs text-[var(--muted)] mb-3">
            İşçi əlavə edin — onlara email ilə hesab aktivləşdirmə linki göndəriləcək.
          </p>
          <StaffCard gymId={gym.id} />
        </Section>
```

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/staff-card.tsx src/components/settings/staff-invite-form.tsx src/components/settings/staff-toggle-button.tsx src/app/settings/page.tsx
git commit -m "feat(auth): staff management card in settings"
```

---

## Task 11: End-to-end runtime verification

**Files:** none (manual/automated runtime check)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (server at `http://localhost:3000`). Ensure DB is up and migrated.

- [ ] **Step 2: Invite flow**

As OWNER → `/settings` → "İşçilər" → enter a name + a real/test email → submit.
Expected: success message "<name> dəvət olundu". If `RESEND_API_KEY` is set, email
arrives; otherwise read the invite URL from the dev-server console (`[email] … skipping`
log will NOT show the URL — instead temporarily log it, or copy the token row from DB).
Open `/accept-invite?token=<raw>` → set a password ≥8 chars with a letter and digit →
submit → land on `/scan`. The staff row in Settings now shows "Aktiv".

- [ ] **Step 3: Staff login**

Log out → log in with the new staff email + password → land on `/scan`. ✓

- [ ] **Step 4: Forgot-password flow**

Log out → `/login` → click "Şifrəni unutdunuz?" → enter the owner email → submit →
see the neutral success message. Grab the reset URL (email or DB token row) →
`/reset-password?token=<raw>` → set a new password → land on `/dashboard`. ✓

- [ ] **Step 5: Probe — expired/invalid token**

Visit `/reset-password?token=garbage` → submit any password → expect
"Link etibarsız və ya vaxtı keçib." Visit `/reset-password` with no token → expect the
"Link etibarsızdır" message with a retry link.

- [ ] **Step 6: Probe — no user enumeration**

`/forgot-password` with an email that does not exist → still shows the same neutral
success message (no "user not found").

- [ ] **Step 7: Probe — deactivated staff cannot log in**

Settings → "Deaktiv et" the staff → attempt staff login → expect
"Email və ya şifrə yanlışdır" (the `login` action checks `user.active`).

- [ ] **Step 8: Final typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: clean.

---

## Self-Review notes (resolved)

- **Spec coverage:** every spec section maps to a task — schema (T1), tokens (T2),
  email (T3), the five actions (T4-T5), the three public pages (T6-T8), login link (T9),
  settings card (T10), verification (T11). ✓
- **Public vs owner client:** spec note honored — public actions use bare `prisma`;
  `inviteStaff`/`setStaffActive` gate via `getOwnerDb()` and scope writes by `gymId`. ✓
- **Type consistency:** `FormState` reused from `auth-actions.ts` across every form;
  `resetPassword`/`acceptInvite` share the `(rawToken, _prev, formData)` bound-action
  signature consumed identically by `useActionState` + `.bind(null, token)`. ✓
- **No password-confirm field:** spec said confirm is client-side optional; dropped to
  keep forms minimal — server enforces min-length + complexity. Acceptable per spec.
