# Staff Invite + Forgot Password — Design

**Date:** 2026-06-01
**Status:** Approved

## Problem

Two gaps in the current auth system:

1. **Staff accounts** require direct database access to create. Owners cannot onboard
   staff without technical help.
2. **Forgot password** does not exist. A locked-out user has no self-service recovery
   path.

## Scope & decisions

- **One token model** covers both use cases: staff invite (kind=INVITE, 48h TTL) and
  password reset (kind=RESET, 1h TTL). Token stored as `sha256(raw)` — raw never
  persisted, same pattern as `ScannerDevice.tokenHash`.
- **Email via Resend SDK** (`resend` npm package). One `RESEND_FROM` env var.
  A thin `src/lib/email.ts` module with two named exports.
- **No user enumeration** — forgot-password endpoint always returns the same message
  whether the email exists or not.
- **Staff invite by link** — owner enters name + email; staff gets an email with a
  one-time setup link to set their own password. No password sharing.
- **Staff management in Settings** — owner can list, invite, and toggle active/inactive
  for staff in their gym.
- **Owner forgot password** works the same as staff forgot password — both use the same
  token flow.

Out of scope: email verification at signup, multi-factor auth, session invalidation on
password change (existing sessions expire naturally after 7d), password strength rules
beyond minimum length.

## Schema changes

### New enum

```prisma
enum TokenKind {
  RESET
  INVITE
}
```

### New model

```prisma
model PasswordResetToken {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique   // sha256(rawToken) — raw never stored
  kind      TokenKind
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

### `User` model addition

```prisma
  resetTokens PasswordResetToken[]
```

Token TTLs:
- `INVITE` — 48 hours (staff has time to check email and set up account)
- `RESET` — 1 hour (short window reduces exposure)

Migration name: `add_password_reset_tokens`

## Email module — `src/lib/email.ts`

```ts
import "server-only";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM ?? "noreply@example.com";

export async function sendInviteEmail(to: string, name: string, inviteUrl: string) { ... }
export async function sendResetEmail(to: string, resetUrl: string) { ... }
```

Both functions send simple HTML emails (no template engine).
Errors are caught and logged — a failed email send does not blow up the server action
(the token still exists; the owner can re-invite).

New env vars required:
- `RESEND_API_KEY` — from Resend dashboard
- `RESEND_FROM` — verified sender address (e.g. `noreply@gympass.az`)

## Token helpers — `src/lib/tokens.ts`

> Note: `acceptInvite`, `resetPassword`, and `requestPasswordReset` are **public**
> actions — they use bare `prisma` (not `getOwnerDb()`/`getGymDb()`), since the user
> is not yet authenticated. `inviteStaff` and `setStaffActive` are owner-only and use
> `getOwnerDb()`.



```ts
export function generateToken(): string           // crypto.randomBytes(32).base64url()
export function hashToken(raw: string): string    // sha256 hex of raw
export function makeExpiry(hours: number): Date   // now + hours
```

Shared by both invite and reset flows.

## Auth actions — `src/lib/auth-actions.ts` additions

### `inviteStaff(formData)`

Owner-only server action (uses `getOwnerDb()`).

1. Validate name (non-empty) and email (valid format) from formData.
2. Check no active User with that email already exists in this gym.
3. `db.$transaction`:
   a. Create `User` (role=STAFF, active=false, passwordHash=`""` placeholder).
   b. Delete any prior unused INVITE tokens for this userId (re-invite cleanup).
   c. Create `PasswordResetToken` (kind=INVITE, expiresAt=now+48h, tokenHash=hash(raw)).
4. Send invite email with URL `/accept-invite?token=<raw>`.
5. `revalidatePath("/settings")`.

### `setStaffActive(staffId, active)`

Owner-only. Toggles `User.active`. `revalidatePath("/settings")`.

### `requestPasswordReset(formData)` — public

1. Validate email.
2. Look up `User` by email — if not found, return same success message (no enumeration).
3. If found and `active`:
   a. Delete existing unused RESET tokens for this userId.
   b. Create `PasswordResetToken` (kind=RESET, expiresAt=now+1h).
   c. Send reset email with URL `/reset-password?token=<raw>`.
4. Always return `{ message: "Emailinizi yoxlayın" }`.

### `resetPassword(rawToken, formData)` — public

1. Hash the raw token; look up `PasswordResetToken` where `tokenHash` matches and
   `kind=RESET`.
2. Validate: not `usedAt`, `expiresAt > now`.
3. Validate new password (min 8 chars).
4. `prisma.$transaction`:
   a. Update `User.passwordHash = bcrypt.hash(password, 10)`.
   b. Set `PasswordResetToken.usedAt = now`.
5. Create session → redirect: STAFF → `/scan`, OWNER → `/dashboard`.

### `acceptInvite(rawToken, formData)` — public

Same as `resetPassword` but for kind=INVITE:
1. Validate token (kind=INVITE, not used, not expired).
2. Set password + mark token used.
3. Set `User.active = true`.
4. Create session → redirect to dashboard (STAFF → `/scan`, OWNER → `/dashboard`).

## Pages

### `/forgot-password`
- `src/app/(auth)/forgot-password/page.tsx` — server component, renders `<ForgotForm />`
- `src/app/(auth)/forgot-password/forgot-form.tsx` — client component using `useActionState`
- Email input + submit. After submit: shows inline success message, hides form.
- Link back to `/login`.

### `/reset-password`
- `src/app/(auth)/reset-password/page.tsx` — reads `?token` from `searchParams`,
  passes raw token as prop to `<ResetForm token={rawToken} />`
- `src/app/(auth)/reset-password/reset-form.tsx` — client component
- If token missing/malformed → shows error. Otherwise: new password + confirm inputs.
- On submit calls `resetPassword(rawToken, formData)`.

### `/accept-invite`
- `src/app/(auth)/accept-invite/page.tsx` — reads `?token` from `searchParams`
- `src/app/(auth)/accept-invite/accept-form.tsx` — client component
- Shows gym name if token valid. New password + confirm inputs.
- On submit calls `acceptInvite(rawToken, formData)`.

### `/settings` — new "İşçilər" section

- `src/components/settings/staff-card.tsx` — server component (owner-only, rendered
  inside the existing `SettingsPage`)
- Lists staff for `user.gymId`: name, email, active badge, "Deaktiv et"/"Aktiv et" toggle button.
- "İşçi əlavə et" inline form: name + email → calls `inviteStaff`.
- Errors displayed inline (duplicate email, invalid format).

### `/login` — small change

Add `"Şifrəni unutdum?"` link below the password field pointing to `/forgot-password`.

## Data flow

```
STAFF INVITE:
  Owner (Settings) → inviteStaff(name, email)
    → create User (active=false) + token
    → sendInviteEmail → staff inbox
      → /accept-invite?token=xxx
        → acceptInvite(token, { password })
          → set password, active=true, create session → /scan

FORGOT PASSWORD:
  /forgot-password → requestPasswordReset(email)
    → create token + sendResetEmail → inbox
      → /reset-password?token=xxx
        → resetPassword(token, { password })
          → update passwordHash, session → /dashboard
```

## Error handling & edge cases

- **Token expired:** `acceptInvite` / `resetPassword` return an error message;
  for invite, owner can re-invite (old token deleted, new one created).
- **Token already used:** `usedAt != null` → reject.
- **Re-invite same email:** `inviteStaff` deletes prior unused INVITE tokens before
  creating a new one, so re-inviting is clean.
- **Email send fails:** logged to stderr; action still returns success — token exists,
  owner can re-trigger by re-inviting.
- **Wrong gym staff:** `forGym` extension on `getOwnerDb()` means `inviteStaff` can
  only create users for the owner's own gym. `setStaffActive` is similarly scoped.
- **STAFF tries to invite:** `getOwnerDb()` → redirects to `/dashboard`.
- **Password mismatch (confirm):** client-side validation only (same pattern as
  delete-member's typed-name check); server validates minimum length.

## Files

### New
- `prisma/migrations/<ts>_add_password_reset_tokens/` (generated)
- `src/lib/tokens.ts`
- `src/lib/email.ts`
- `src/app/(auth)/forgot-password/page.tsx`
- `src/app/(auth)/forgot-password/forgot-form.tsx`
- `src/app/(auth)/reset-password/page.tsx`
- `src/app/(auth)/reset-password/reset-form.tsx`
- `src/app/(auth)/accept-invite/page.tsx`
- `src/app/(auth)/accept-invite/accept-form.tsx`
- `src/components/settings/staff-card.tsx`

### Modified
- `prisma/schema.prisma` — new enum + model + User back-relation
- `src/lib/auth-actions.ts` — add `inviteStaff`, `setStaffActive`, `requestPasswordReset`,
  `resetPassword`, `acceptInvite`
- `src/app/(auth)/login/login-form.tsx` — add forgot-password link
- `src/app/settings/page.tsx` — add `<StaffCard />` section

## Reusable patterns to copy

- Token generation + hashing → `src/lib/scan-actions.ts` (`ScannerDevice` pairing code)
- Server-action form with `useActionState` → `src/app/(auth)/login/login-form.tsx`
- Owner-only settings card → `src/components/settings/profile-form.tsx`
- `getOwnerDb()` owner gate → any file in `src/lib/member-actions.ts`

## Verification

1. **Invite flow** — as owner, open Settings → "İşçi əlavə et" → enter name + email →
   submit → check email arrives → open invite link → set password → land on `/scan` →
   log out → log in with new staff credentials → land on `/scan` ✓.
2. **Re-invite** — invite same email again → old link rejected ("link artıq istifadə
   edilib" or expired), new link works.
3. **Forgot password (owner)** — log out → `/forgot-password` → enter owner email →
   check email → open reset link → set new password → land on `/dashboard` ✓.
4. **Forgot password (staff)** — same flow → land on `/scan` ✓.
5. **Expired token** — wait past 1h (or set `expiresAt` to past in DB) → reset link
   shows error.
6. **Staff deactivate** — Settings → deactivate staff → staff login attempt → error
   "Email və ya şifrə yanlışdır" (active=false check in login action).
7. **Typecheck** — `npm run typecheck` clean.
