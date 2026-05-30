# Paired Scanner Device Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the gym owner pair a phone from the laptop dashboard and use it as a permanent door scanner — bound to one gym, revocable, with no daily login.

**Architecture:** A new `ScannerDevice` model holds a hashed long-lived token per phone, minted via a 5-minute one-time pairing code. The phone gets a `gympass_scanner_device` cookie and lands on a stripped `/door` route. A new `getActorDb()` helper lets `verifyScan` and `manualLookup` accept either a user session or a paired device; CheckIn rows carry `scannerDeviceId` when the actor is a device. All tenant isolation flows through the existing `forGym` extension.

**Tech Stack:** Next.js 16 (App Router), Prisma 6 (`prisma-client` generator → `@/generated/prisma/client`), jose JWT (existing — not reused here; device tokens are opaque), PostgreSQL 16. AZ-first UI labels. Money in cents via `@/lib/money`.

**Verification model:** This codebase has **no test framework installed** (zero tests today). Each task verifies with (a) `npx tsc --noEmit` and (b) a targeted manual smoke step in the dev server / Prisma Studio. Do **not** scaffold a test runner as part of this feature — that's a separate decision.

**Spec:** `docs/superpowers/specs/2026-05-30-paired-scanner-device-design.md`

**Reading order before you start:**
1. The spec above (especially Schema, Pairing flow, Auth dispatch, Failure modes).
2. `src/lib/tenant.ts` — the tenant scoping extension. Understand `TENANT_MODELS`, the load-time completeness guard, and the fail-closed default.
3. `src/lib/dal.ts` — `getCurrentUser`, `requireOwner`, `getGymDb`, `getOwnerDb`. The new `getActorDb` follows this shape.
4. `src/lib/session.ts` — cookie pattern (`cookies()` is async in Next 16, sets `httpOnly` + `secure` in prod + `sameSite=lax`).
5. `proxy.ts` — the new-name-for-middleware in Next 16. Public-path detection lives here.
6. `src/lib/scan-actions.ts` — the existing scan pipeline you'll graft device support onto.

**Cross-cutting conventions:**
- Server actions return discriminated states (`{ ok: true } | { ok: false; message }` or zod-style `{ errors }`). Match the surrounding file's existing shape per file.
- Use `revalidatePath` not `router.refresh()` on the server side.
- AZ labels (Azerbaijani): "Skanerlər", "Yeni cihaz əlavə et", "Qapı telefonu", "Sil", "Vaxtı keçib", "Bu cihaz ləğv edilib".
- Zod v4: use `z.flattenError(parsed.error).fieldErrors`, not `.flatten()`.
- Money: integer cents via `@/lib/money`. (Not used in this feature, but flag if you find yourself reaching for floats.)
- Commit after each task with the suggested message.

---

## File Structure

**New files:**

- `prisma/migrations/<timestamp>_scanner_devices/migration.sql` — schema migration
- `src/lib/device.ts` — device cookie I/O + `readDevice()` + `getDeviceDb()`
- `src/lib/actor.ts` — `getActorDb()` (session-first, device-fallback) + `actorLabel()`
- `src/lib/scanner-device-actions.ts` — pairing CRUD + revoke + `redeemPairing` + `grantManualEntry`
- `src/app/door/layout.tsx` — full-bleed phone shell (no AppShell sidebar)
- `src/app/door/page.tsx` — header + counter + scanner + manual lookup
- `src/app/door/pair/page.tsx` — public; manual code entry
- `src/app/door/pair/[code]/page.tsx` — public; auto-redeem
- `src/app/door/revoked/page.tsx` — public; "Bu cihaz ləğv edilib"
- `src/components/scanner-devices-card.tsx` — Settings card (list + pair modal + revoke)
- `src/components/pair-device-dialog.tsx` — modal client component with QR + countdown

**Modified files:**

- `prisma/schema.prisma` — add `ScannerDevice` model + `CheckIn.scannerDeviceId` + back-relations on `Gym` and `User`
- `src/lib/tenant.ts` — add `"ScannerDevice"` to `TENANT_MODELS`
- `src/lib/scan-actions.ts` — `verifyScan` and `manualLookup` use `getActorDb()`; CheckIn writes carry `scannerDeviceId` when actor is a device
- `proxy.ts` — let `/door/*` through to its own auth
- `src/app/settings/page.tsx` — slot the `<ScannerDevicesCard>` between profile and templates

---

## Task 1: Schema — `ScannerDevice` model + `CheckIn.scannerDeviceId`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<auto-timestamp>_scanner_devices/migration.sql` (created by `prisma migrate dev`)

- [ ] **Step 1: Add the `ScannerDevice` model**

Open `prisma/schema.prisma`. After the `VisitorPass` model, add:

```prisma
// ─── Scanner devices (paired phones) ─────────────────────────────────
// A phone paired from the dashboard. Holds a hashed long-lived token.
// The raw token only ever exists in the phone's `gympass_scanner_device`
// cookie. Revoking is `revokedAt = now()`.

model ScannerDevice {
  id               String    @id @default(cuid())
  gymId            String
  name             String
  // sha256(token) — set after the phone redeems the pairing code.
  // Nullable while the device is in "awaiting pairing" state.
  tokenHash        String?   @unique
  // One-time pairing code (URL-safe). Cleared once redeemed.
  pairingCode      String?   @unique
  pairingExpiresAt DateTime?
  lastSeenAt       DateTime?
  revokedAt        DateTime?
  createdAt        DateTime  @default(now())

  gym      Gym       @relation(fields: [gymId], references: [id], onDelete: Cascade)
  checkIns CheckIn[]

  @@index([gymId, revokedAt])
}
```

- [ ] **Step 2: Add `scannerDeviceId` to `CheckIn`**

Inside the `CheckIn` model, add the field next to `scannedById`:

```prisma
  scannerDeviceId String?
```

And the relation next to the existing relations (after the `gym` relation):

```prisma
  scannerDevice ScannerDevice? @relation(fields: [scannerDeviceId], references: [id], onDelete: SetNull)
```

- [ ] **Step 3: Add back-relations to `Gym` and `User`**

`Gym` is the tenant root. After its existing relations, add:

```prisma
  scannerDevices ScannerDevice[]
```

`User` does NOT need a relation to `ScannerDevice` — devices are gym-scoped, not user-scoped. Skip it. (If `prisma format` complains, it won't — there's no relation to back.)

- [ ] **Step 4: Run the migration**

Start the database if it isn't up:
```
docker compose up -d
```

Generate and apply:
```
npx prisma migrate dev --name scanner_devices
```

Expected: migration created at `prisma/migrations/<timestamp>_scanner_devices/migration.sql`. The SQL should add a new `ScannerDevice` table, add a `scannerDeviceId` column to `CheckIn`, and add the foreign key.

- [ ] **Step 5: Verify schema with typecheck**

```
npx prisma generate
npx tsc --noEmit
```

Expected: clean. Two new types should be importable: `ScannerDevice` from `@/generated/prisma/client` and the new field on `CheckIn`.

If `prisma generate` fails on Windows with EPERM (DLL locked by `next dev`), stop the dev server first and retry.

- [ ] **Step 6: Commit**

```
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(schema): add ScannerDevice model and CheckIn.scannerDeviceId"
```

---

## Task 2: Classify `ScannerDevice` in tenant isolation

**Files:**
- Modify: `src/lib/tenant.ts`

`tenant.ts` has a load-time completeness guard that throws if any model isn't classified. After Task 1, `ScannerDevice` exists but isn't classified, so importing `tenant.ts` will throw at startup. Fix that.

- [ ] **Step 1: Add `"ScannerDevice"` to `TENANT_MODELS`**

In `src/lib/tenant.ts`, update the set:

```ts
const TENANT_MODELS = new Set<string>([
  "Member",
  "Payment",
  "CheckIn",
  "PlanPrice",
  "AuditLog",
  "Lead",
  "VisitorPass",
  "ScannerDevice",
]);
```

`NON_TENANT_MODELS` is unchanged (`Gym`, `User`, `Freeze`).

- [ ] **Step 2: Typecheck**

```
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Smoke — verify the guard doesn't throw**

Quickly start dev and load any authenticated page (e.g. `/dashboard`):

```
npm run dev
```

Visit `http://localhost:3000/dashboard` after logging in. If the page renders (or simply redirects without an internal 500), the guard ran clean. Stop the server.

If you see a 500 with `tenant.ts: model "X" is not classified` — a schema model was added that needs classification.

- [ ] **Step 4: Commit**

```
git add src/lib/tenant.ts
git commit -m "feat(tenant): classify ScannerDevice as gym-scoped"
```

---

## Task 3: Device cookie + `readDevice` + `getDeviceDb`

**Files:**
- Create: `src/lib/device.ts`

This mirrors `src/lib/session.ts` but for opaque device tokens (no JWT — the token is just random bytes; the server hashes and looks up).

- [ ] **Step 1: Create `src/lib/device.ts`**

```ts
import "server-only";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { forGym } from "@/lib/tenant";

export const DEVICE_COOKIE = "gympass_scanner_device";
const ONE_YEAR_S = 365 * 24 * 60 * 60;
// Throttle lastSeenAt writes — at most once per minute per device.
const LAST_SEEN_THROTTLE_MS = 60 * 1000;

export type DevicePayload = {
  id: string;
  gymId: string;
  name: string;
};

export function hashDeviceToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function setDeviceCookie(token: string) {
  const store = await cookies();
  store.set(DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ONE_YEAR_S,
    path: "/",
  });
}

export async function clearDeviceCookie() {
  const store = await cookies();
  store.delete(DEVICE_COOKIE);
}

// Returns the paired device for this request, or null if absent/invalid/revoked.
export async function readDevice(): Promise<DevicePayload | null> {
  const store = await cookies();
  const raw = store.get(DEVICE_COOKIE)?.value;
  if (!raw) return null;

  const tokenHash = hashDeviceToken(raw);
  const device = await prisma.scannerDevice.findUnique({
    where: { tokenHash },
    select: { id: true, gymId: true, name: true, revokedAt: true, lastSeenAt: true },
  });
  if (!device || device.revokedAt) return null;

  // Best-effort, throttled lastSeenAt bump. Don't block on this.
  const now = Date.now();
  const last = device.lastSeenAt?.getTime() ?? 0;
  if (now - last > LAST_SEEN_THROTTLE_MS) {
    prisma.scannerDevice
      .update({ where: { id: device.id }, data: { lastSeenAt: new Date(now) } })
      .catch(() => {
        // intentionally swallow — telemetry, not load-bearing
      });
  }

  return { id: device.id, gymId: device.gymId, name: device.name };
}

// Returns { device, db: forGym(device.gymId) }. Redirects to /door/pair when
// no device cookie is present, /door/revoked when revoked/invalid.
// Use this from /door pages and from any device-only server action.
export async function getDeviceDb() {
  const device = await readDevice();
  if (!device) {
    // We can't tell here whether the cookie was absent or revoked without
    // re-reading; readDevice returns null for both. Send unauthenticated
    // devices to /door/pair — revoked devices end up there too, which is fine
    // (they re-pair). For an explicit revoked message, callers can branch.
    const { redirect } = await import("next/navigation");
    redirect("/door/pair");
  }
  return { device, db: forGym(device.gymId) };
}
```

- [ ] **Step 2: Typecheck**

```
npx tsc --noEmit
```

Expected: clean. `scannerDevice` should be a known model on `prisma`.

- [ ] **Step 3: Commit**

```
git add src/lib/device.ts
git commit -m "feat(device): add cookie helpers, readDevice, getDeviceDb"
```

---

## Task 4: `getActorDb()` — session-first, device-fallback

**Files:**
- Create: `src/lib/actor.ts`

`verifyScan` and `manualLookup` currently use `getGymDb()` (session-only). We want them to accept either a logged-in user or a paired device. `getActorDb()` is that dispatch.

- [ ] **Step 1: Create `src/lib/actor.ts`**

```ts
import "server-only";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { readDevice, type DevicePayload } from "@/lib/device";
import { prisma } from "@/lib/prisma";
import { forGym, type GymDb } from "@/lib/tenant";

export type Actor =
  | { kind: "user"; user: { id: string; gymId: string; role: "OWNER" | "STAFF" }; device: null }
  | { kind: "device"; user: null; device: DevicePayload };

// Returns a gym-scoped client plus the acting principal. Prefer the user session;
// fall back to the paired-device cookie. Redirect to /login if neither is present.
//
// Callers that want a *labelled* attribution string (e.g. for audit display)
// should use actorLabel() below.
export async function getActorDb(): Promise<{ actor: Actor; db: GymDb }> {
  const session = await readSession();
  if (session?.userId) {
    // Reload the user so role is current. (Session JWT is signed but lags the DB.)
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, gymId: true, role: true },
    });
    if (user?.gymId) {
      return {
        actor: { kind: "user", user, device: null },
        db: forGym(user.gymId),
      };
    }
  }

  const device = await readDevice();
  if (device) {
    return {
      actor: { kind: "device", user: null, device },
      db: forGym(device.gymId),
    };
  }

  redirect("/login");
}

export function actorLabel(row: {
  scannedBy?: { name: string } | null;
  scannerDevice?: { name: string } | null;
}): string {
  if (row.scannedBy) return row.scannedBy.name;
  if (row.scannerDevice) return row.scannerDevice.name;
  return "Sistem";
}
```

- [ ] **Step 2: Typecheck**

```
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```
git add src/lib/actor.ts
git commit -m "feat(actor): add getActorDb session-or-device dispatch"
```

---

## Task 5: Scanner-device server actions — pairing CRUD

**Files:**
- Create: `src/lib/scanner-device-actions.ts`

This task implements the **owner-side** actions: create a pairing, regenerate an expired pairing, revoke a device. (`redeemPairing` and `grantManualEntry` come in the next two tasks.)

- [ ] **Step 1: Create `src/lib/scanner-device-actions.ts`**

```ts
"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOwnerDb } from "@/lib/dal";

const PAIRING_TTL_MS = 5 * 60 * 1000;

export type PairingResult =
  | { ok: true; deviceId: string; pairingCode: string; expiresAt: string }
  | { ok: false; message: string; errors?: Record<string, string[]> };

const nameSchema = z.object({
  name: z
    .string()
    .min(2, "Ad ən az 2 simvol olmalıdır")
    .max(40, "Ad çox uzundur")
    .trim(),
});

function freshPairingCode(): string {
  // 8 random bytes → 11 base64url chars. Plenty of entropy for a 5-minute window.
  return crypto.randomBytes(8).toString("base64url");
}

export async function createScannerPairing(
  _prev: PairingResult | undefined,
  formData: FormData
): Promise<PairingResult> {
  const { user, db } = await getOwnerDb();
  const parsed = nameSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return {
      ok: false,
      message: "Ad düzgün deyil",
      errors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const pairingCode = freshPairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);

  const device = await db.scannerDevice.create({
    data: {
      gymId: user.gymId,
      name: parsed.data.name,
      pairingCode,
      pairingExpiresAt: expiresAt,
    },
    select: { id: true },
  });

  revalidatePath("/settings");
  return {
    ok: true,
    deviceId: device.id,
    pairingCode,
    expiresAt: expiresAt.toISOString(),
  };
}

// Regenerate a pairing code on an existing (still-unpaired) device row.
// Useful when the 5-minute window expired and the owner is still in the modal.
export async function regeneratePairing(
  deviceId: string
): Promise<PairingResult> {
  const { db } = await getOwnerDb();
  const existing = await db.scannerDevice.findFirst({
    where: { id: deviceId },
    select: { id: true, tokenHash: true, revokedAt: true },
  });
  if (!existing) return { ok: false, message: "Cihaz tapılmadı" };
  if (existing.tokenHash) return { ok: false, message: "Cihaz artıq qoşulub" };
  if (existing.revokedAt) return { ok: false, message: "Cihaz ləğv edilib" };

  const pairingCode = freshPairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);

  await db.scannerDevice.update({
    where: { id: deviceId },
    data: { pairingCode, pairingExpiresAt: expiresAt },
  });

  revalidatePath("/settings");
  return { ok: true, deviceId, pairingCode, expiresAt: expiresAt.toISOString() };
}

export async function revokeScannerDevice(
  deviceId: string
): Promise<{ ok: boolean; message?: string }> {
  const { user, db } = await getOwnerDb();
  const device = await db.scannerDevice.findFirst({
    where: { id: deviceId },
    select: { id: true, name: true, revokedAt: true },
  });
  if (!device) return { ok: false, message: "Cihaz tapılmadı" };
  if (device.revokedAt) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.scannerDevice.update({
      where: { id: deviceId },
      data: { revokedAt: new Date(), tokenHash: null, pairingCode: null },
    });
    await tx.auditLog.create({
      data: {
        gymId: user.gymId,
        actorId: user.id,
        action: "device.revoked",
        entityType: "ScannerDevice",
        entityId: deviceId,
        payload: { name: device.name },
      },
    });
  });

  revalidatePath("/settings");
  return { ok: true };
}
```

Note: `revokeScannerDevice` uses raw `prisma.$transaction` (not `db.$transaction`) because we need both `tx.scannerDevice.update` and `tx.auditLog.create` in one transaction; the explicit `gymId: user.gymId` on auditLog is required (the extension overrides anyway, but TypeScript requires it on create).

- [ ] **Step 2: Typecheck**

```
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Smoke (DB only — no UI yet)**

```
npx prisma studio
```

In Prisma Studio, manually create a `ScannerDevice` row to confirm the table accepts the shape. Delete it after. (UI smoke comes in Task 11.)

- [ ] **Step 4: Commit**

```
git add src/lib/scanner-device-actions.ts
git commit -m "feat(devices): owner actions to create/regenerate/revoke pairings"
```

---

## Task 6: `redeemPairing` server action

**Files:**
- Modify: `src/lib/scanner-device-actions.ts`

The redeem action is **public** — the phone has no auth yet when it calls this. Pattern matches `submitLead` in `src/lib/lead-actions.ts`.

- [ ] **Step 1: Add `redeemPairing` to `src/lib/scanner-device-actions.ts`**

Append (after `revokeScannerDevice`):

```ts
import { setDeviceCookie, hashDeviceToken } from "@/lib/device";

export type RedeemResult =
  | { ok: true; gymName: string }
  | { ok: false; message: string };

// Public action — no auth. Called by /door/pair/[code]. Validates the code,
// mints a long-lived opaque token, stores sha256(token) on the device row,
// sets the gympass_scanner_device cookie on the phone, returns ok.
export async function redeemPairing(code: string): Promise<RedeemResult> {
  if (!code || code.length < 8 || code.length > 32) {
    return { ok: false, message: "Kod düzgün deyil" };
  }

  const device = await prisma.scannerDevice.findUnique({
    where: { pairingCode: code },
    select: {
      id: true,
      gymId: true,
      tokenHash: true,
      pairingExpiresAt: true,
      revokedAt: true,
      gym: { select: { name: true } },
    },
  });

  if (!device) return { ok: false, message: "Kod tapılmadı" };
  if (device.revokedAt) return { ok: false, message: "Cihaz ləğv edilib" };
  if (device.tokenHash) return { ok: false, message: "Kod artıq istifadə olunub" };
  if (!device.pairingExpiresAt || device.pairingExpiresAt.getTime() < Date.now()) {
    return { ok: false, message: "Kodun vaxtı keçib" };
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashDeviceToken(token);

  await prisma.$transaction(async (tx) => {
    await tx.scannerDevice.update({
      where: { id: device.id },
      data: {
        tokenHash,
        pairingCode: null,
        pairingExpiresAt: null,
        lastSeenAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        gymId: device.gymId,
        actorId: null, // phone is unauthenticated at this point
        action: "device.paired",
        entityType: "ScannerDevice",
        entityId: device.id,
        payload: { name: undefined }, // we didn't select name above; not critical
      },
    });
  });

  await setDeviceCookie(token);
  return { ok: true, gymName: device.gym.name };
}
```

Note: We add `name` to the select to populate the audit payload more usefully. Adjust the `findUnique` select to include `name: true`, then replace the audit payload line with `payload: { name: device.name }`:

```ts
  const device = await prisma.scannerDevice.findUnique({
    where: { pairingCode: code },
    select: {
      id: true,
      gymId: true,
      name: true,
      tokenHash: true,
      pairingExpiresAt: true,
      revokedAt: true,
      gym: { select: { name: true } },
    },
  });
```

```ts
        payload: { name: device.name },
```

- [ ] **Step 2: Typecheck**

```
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```
git add src/lib/scanner-device-actions.ts
git commit -m "feat(devices): public redeemPairing action sets the device cookie"
```

---

## Task 7: Switch `scan-actions.ts` to `getActorDb` + `grantManualEntry`

**Files:**
- Modify: `src/lib/scan-actions.ts`
- Modify: `src/lib/scanner-device-actions.ts` (or co-locate `grantManualEntry` in `scan-actions.ts`)

We add device support to the existing scan pipeline. The cleanest path: `verifyScan` and `manualLookup` switch to `getActorDb()`; CheckIn rows pick up `scannerDeviceId` when the actor is a device. Add a new `grantManualEntry` for door-side manual entries (it runs the same gates as `verifyScan` but skips the QR step).

- [ ] **Step 1: Update `verifyScan` to dispatch on actor**

Open `src/lib/scan-actions.ts`. Replace the `getGymDb` import and the first lines of `verifyScan`:

```ts
import { getActorDb, type Actor } from "@/lib/actor";
```

Remove the old `import { getGymDb } from "@/lib/dal";` (no other callers in this file after this task — confirm by grep).

In `verifyScan`, replace:
```ts
  const { user, db } = await getGymDb();
```
with:
```ts
  const { actor, db } = await getActorDb();
```

Then, every `scannedById: user.id` becomes a helper. Add this small helper at the top of the file (after the imports, before `extractToken`):

```ts
function attribution(actor: Actor) {
  if (actor.kind === "user") {
    return { scannedById: actor.user.id, scannerDeviceId: null };
  }
  return { scannedById: null, scannerDeviceId: actor.device.id };
}
```

Now replace each of the four `tx.checkIn.create({ data: { ... gymId: user.gymId, ... scannedById: user.id, ... } })` blocks. The `gymId` stays explicit (TypeScript requires it on create); swap `scannedById: user.id` for `...attribution(actor)`. Concretely, the three CheckIn creates inside `verifyScan` become:

For the **status-denied** block:
```ts
    await db.checkIn.create({
      data: {
        gymId: actor.kind === "user" ? actor.user.gymId : actor.device.gymId,
        memberId: member.id,
        ...attribution(actor),
        result: "DENIED",
        deniedReason: REASON[member.status],
      },
    });
```

For the **payment-denied** block:
```ts
      await db.checkIn.create({
        data: {
          gymId: actor.kind === "user" ? actor.user.gymId : actor.device.gymId,
          memberId: member.id,
          ...attribution(actor),
          result: "DENIED",
          deniedReason: REASON.PAYMENT,
        },
      });
```

For the **granted** block at the end:
```ts
  const checkIn = await db.checkIn.create({
    data: {
      gymId: actor.kind === "user" ? actor.user.gymId : actor.device.gymId,
      memberId: member.id,
      ...attribution(actor),
      result: "GRANTED",
    },
  });
```

Also, the `canOverride` flags currently key off `user.role === "OWNER"`. Devices don't have a role and can't override:
```ts
        canOverride: actor.kind === "user" && actor.user.role === "OWNER",
```
Apply that change in both spots that currently set `canOverride`.

Pull the gymId helper into a single `const actorGymId = actor.kind === "user" ? actor.user.gymId : actor.device.gymId;` near the top of `verifyScan` body to keep the create blocks tidy. Final shape (right after `const { actor, db } = await getActorDb();`):

```ts
  const actorGymId = actor.kind === "user" ? actor.user.gymId : actor.device.gymId;
```

Then the three creates use `gymId: actorGymId`.

- [ ] **Step 2: Update `overrideScan` to remain user-only**

`overrideScan` stays owner-only. It currently uses `getGymDb`. Keep that — or switch to `getActorDb` and reject when `actor.kind !== "user"`. Recommended: switch and reject, so a future caller can't accidentally invoke from a device:

```ts
export async function overrideScan(memberId: string, note: string) {
  const { actor, db } = await getActorDb();
  if (actor.kind !== "user" || actor.user.role !== "OWNER") return { ok: false };
  const user = actor.user;
  // ...rest unchanged
}
```

The `tx.checkIn.create` inside `overrideScan` still sets `scannedById: user.id` and `gymId: user.gymId` explicitly. No `scannerDeviceId` here (it's a user-driven override).

- [ ] **Step 3: Update `manualLookup` to use `getActorDb`**

```ts
export async function manualLookup(query: string) {
  const { db } = await getActorDb();
  const q = query.trim();
  if (q.length < 2) return [];
  return db.member.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { publicId: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, publicId: true, phone: true, status: true },
    take: 8,
  });
}
```

- [ ] **Step 4: Add `grantManualEntry`**

Append to `src/lib/scan-actions.ts`:

```ts
import { ensurePendingPayments, computeEffectiveStatus } from "@/lib/payments";

// Manual entry from /door when the member's phone is dead. Same gates as verifyScan
// (status + current-period payment), but no token verification. Returns the same
// ScanResult shape so the UI can reuse the result screen.
export async function grantManualEntry(memberId: string): Promise<ScanResult> {
  const { actor, db } = await getActorDb();
  const actorGymId = actor.kind === "user" ? actor.user.gymId : actor.device.gymId;

  const member = await db.member.findFirst({
    where: { id: memberId },
    select: {
      id: true,
      name: true,
      publicId: true,
      photoUrl: true,
      status: true,
      expiryDate: true,
    },
  });
  if (!member) return { ok: false, reason: REASON.not_found };

  const memberInfo = {
    id: member.id,
    name: member.name,
    publicId: member.publicId,
    photoUrl: member.photoUrl,
  };

  if (
    member.status === "FROZEN" ||
    member.status === "EXPIRED" ||
    member.status === "CANCELLED"
  ) {
    await db.checkIn.create({
      data: {
        gymId: actorGymId,
        memberId: member.id,
        ...attribution(actor),
        result: "DENIED",
        deniedReason: REASON[member.status],
      },
    });
    return {
      ok: false,
      reason: REASON[member.status],
      member: memberInfo,
      canOverride: actor.kind === "user" && actor.user.role === "OWNER",
    };
  }

  await ensurePendingPayments(member.id);
  const today = new Date();
  const currentPayment = await db.payment.findFirst({
    where: { memberId: member.id, dueDate: { lte: today } },
    orderBy: { dueDate: "desc" },
  });
  if (currentPayment) {
    const eff = computeEffectiveStatus(currentPayment);
    if (eff !== "PAID") {
      await db.checkIn.create({
        data: {
          gymId: actorGymId,
          memberId: member.id,
          ...attribution(actor),
          result: "DENIED",
          deniedReason: REASON.PAYMENT,
        },
      });
      return {
        ok: false,
        reason: REASON.PAYMENT,
        member: memberInfo,
        canOverride: actor.kind === "user" && actor.user.role === "OWNER",
      };
    }
  }

  const checkIn = await db.checkIn.create({
    data: {
      gymId: actorGymId,
      memberId: member.id,
      ...attribution(actor),
      result: "GRANTED",
    },
  });

  return {
    ok: true,
    member: {
      ...memberInfo,
      status: member.status,
      expiryDate: member.expiryDate.toISOString().slice(0, 10),
    },
    checkInId: checkIn.id,
  };
}
```

Add a `not_found` key to `REASON` if it isn't already there:
```ts
  not_found: "Üzv tapılmadı",
```
(Check first — it may already exist per the prior session work.)

- [ ] **Step 5: Typecheck**

```
npx tsc --noEmit
```

Expected: clean. If anything errors about the `Actor` import, confirm `actor.ts` exports `Actor` (it does, per Task 4).

- [ ] **Step 6: Smoke**

```
npm run dev
```

Log in as owner, visit `/scan`, scan an existing member QR. Expected: same green/red as before. (Device behavior comes in Task 10's smoke.) Stop the server.

- [ ] **Step 7: Commit**

```
git add src/lib/scan-actions.ts
git commit -m "feat(scan): accept paired-device actor, add grantManualEntry"
```

---

## Task 8: Proxy exemption for `/door/*`

**Files:**
- Modify: `proxy.ts`

The proxy currently redirects anything non-public to `/login`. The `/door` routes manage their own auth (device cookie or pair page), so the proxy should let them through.

- [ ] **Step 1: Add `/door/` to `isPublicPass`**

Open `proxy.ts`. Update the helper:

```ts
function isPublicPass(path: string) {
  return (
    path.startsWith("/pass/") ||
    path.startsWith("/join/") ||
    path.startsWith("/visit/") ||
    path.startsWith("/door/") ||
    path === "/door"
  );
}
```

Why "let through" rather than "device-auth at the proxy": Next 16 proxy/middleware runs in the edge runtime, where Prisma and `node:crypto` can be awkward. Letting the page-level `readDevice()` handle auth keeps that logic in the Node runtime where it works cleanly.

- [ ] **Step 2: Typecheck**

```
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Smoke**

```
npm run dev
```

Visit `http://localhost:3000/door` while logged **out**. Expected: NOT redirected to `/login` (proxy lets it through). Since the page doesn't exist yet, you'll get a 404 — that's fine. Stop the server.

- [ ] **Step 4: Commit**

```
git add proxy.ts
git commit -m "feat(proxy): let /door/* through to page-level device auth"
```

---

## Task 9: Public pair pages — `/door/pair`, `/door/pair/[code]`, `/door/revoked`

**Files:**
- Create: `src/app/door/pair/page.tsx`
- Create: `src/app/door/pair/[code]/page.tsx`
- Create: `src/app/door/revoked/page.tsx`
- Create: `src/components/redeem-pairing-form.tsx`

These pages are **unauthenticated**. They're the only paths under `/door` that work without a device cookie. After redeem succeeds, the cookie is set and we redirect to `/door`.

- [ ] **Step 1: Create the redeem form (client)**

`src/components/redeem-pairing-form.tsx`:

```tsx
"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { redeemPairing } from "@/lib/scanner-device-actions";

export function RedeemPairingForm({ initialCode = "" }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await redeemPairing(code.trim());
      if (result.ok) {
        router.replace("/door");
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm font-medium">Qoşulma kodu</label>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Kod"
        className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-base"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending || code.trim().length === 0}
        className="btn-brand w-full"
      >
        {isPending ? "Qoşulur..." : "Qoşul"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create the manual-entry pair page**

`src/app/door/pair/page.tsx`:

```tsx
import { Smartphone } from "lucide-react";
import { RedeemPairingForm } from "@/components/redeem-pairing-form";

export const dynamic = "force-dynamic";

export default function DoorPairPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] flex items-center justify-center px-4 py-10">
      <div className="card w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-[var(--brand-strong)]" />
          <h1 className="font-medium">Skaner cihazını qoş</h1>
        </div>
        <p className="text-sm text-[var(--muted)]">
          Sahibinizdən qoşulma kodu istəyin və aşağıda daxil edin.
        </p>
        <RedeemPairingForm />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Create the auto-redeem URL page**

`src/app/door/pair/[code]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { Smartphone } from "lucide-react";
import { redeemPairing } from "@/lib/scanner-device-actions";
import { RedeemPairingForm } from "@/components/redeem-pairing-form";

export const dynamic = "force-dynamic";

export default async function DoorPairCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const result = await redeemPairing(code);
  if (result.ok) {
    redirect("/door");
  }

  return (
    <main className="min-h-screen bg-[var(--background)] flex items-center justify-center px-4 py-10">
      <div className="card w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-[var(--brand-strong)]" />
          <h1 className="font-medium">Qoşulma uğursuz oldu</h1>
        </div>
        <p className="text-sm text-red-600">{result.message}</p>
        <p className="text-sm text-[var(--muted)]">
          Aşağıda kodu yenidən daxil edə bilərsiniz:
        </p>
        <RedeemPairingForm initialCode={code} />
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Create the revoked page**

`src/app/door/revoked/page.tsx`:

```tsx
import { ShieldOff } from "lucide-react";
import Link from "next/link";

export default function DoorRevokedPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] flex items-center justify-center px-4 py-10">
      <div className="card w-full max-w-sm p-6 space-y-4 text-center">
        <ShieldOff className="w-8 h-8 text-red-500 mx-auto" />
        <h1 className="font-medium">Bu cihaz ləğv edilib</h1>
        <p className="text-sm text-[var(--muted)]">
          Skaner cihazınız sahibiniz tərəfindən söndürülüb. Yenidən qoşulmaq üçün
          ondan yeni qoşulma kodu istəyin.
        </p>
        <Link href="/door/pair" className="btn-ghost inline-block">
          Yenidən qoşul
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Typecheck**

```
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Smoke**

```
npm run dev
```

In Prisma Studio, create a `ScannerDevice` row with a known `pairingCode` (e.g. `TESTCODE`) and `pairingExpiresAt` set to a few minutes in the future. Then in an incognito phone-emulating browser tab:

- Visit `http://localhost:3000/door/pair/TESTCODE` → expect redirect to `/door` (which will 404 until Task 10) AND the `gympass_scanner_device` cookie to be set (check DevTools → Application → Cookies).
- In Prisma Studio, refresh the device row: `tokenHash` is now a 64-char hex string; `pairingCode` is `null`.
- Visit `http://localhost:3000/door/pair/TESTCODE` again → expect "Kod tapılmadı" or "artıq istifadə olunub". Stop the server.

- [ ] **Step 7: Commit**

```
git add src/app/door/pair src/app/door/revoked src/components/redeem-pairing-form.tsx
git commit -m "feat(door): public pair pages and revoked landing"
```

---

## Task 10: `/door` layout + page (scanner + counter + manual lookup)

**Files:**
- Create: `src/app/door/layout.tsx`
- Create: `src/app/door/page.tsx`
- Create: `src/components/door-manual-lookup.tsx`

The door page reuses the existing `<Scanner>` component verbatim (it calls `verifyScan`, which is now actor-aware).

- [ ] **Step 1: Create the door layout**

`src/app/door/layout.tsx`:

```tsx
export default function DoorLayout({ children }: { children: React.ReactNode }) {
  // Full-bleed: no AppShell sidebar, no top nav, mobile-first.
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create the manual-lookup client component**

`src/components/door-manual-lookup.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { manualLookup, grantManualEntry, type ScanResult } from "@/lib/scan-actions";

type Hit = {
  id: string;
  name: string;
  publicId: string;
  phone: string;
  status: string;
};

export function DoorManualLookup({
  onResult,
}: {
  onResult: (r: ScanResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [isPending, startTransition] = useTransition();

  function search(value: string) {
    setQ(value);
    if (value.trim().length < 2) {
      setHits([]);
      return;
    }
    startTransition(async () => {
      const results = await manualLookup(value);
      setHits(results as Hit[]);
    });
  }

  function grant(memberId: string) {
    startTransition(async () => {
      const result = await grantManualEntry(memberId);
      onResult(result);
      setOpen(false);
      setQ("");
      setHits([]);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-[var(--brand-strong)] underline"
      >
        Telefonu olmayan üzv?
      </button>
    );
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-[var(--muted)]" />
        <input
          autoFocus
          value={q}
          onChange={(e) => search(e.target.value)}
          placeholder="Ad, telefon, ID..."
          className="flex-1 outline-none bg-transparent text-sm"
        />
        <button onClick={() => setOpen(false)} aria-label="Bağla">
          <X className="w-4 h-4 text-[var(--muted)]" />
        </button>
      </div>
      {isPending && <p className="text-xs text-[var(--muted)]">Axtarılır...</p>}
      {hits.length > 0 && (
        <ul className="divide-y divide-[var(--border)]">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                onClick={() => grant(h.id)}
                className="w-full text-left py-2 hover:bg-[var(--background)]"
              >
                <div className="text-sm font-medium">{h.name}</div>
                <div className="text-[11px] text-[var(--muted)]">
                  {h.publicId} · {h.phone}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create the door page**

`src/app/door/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { DoorPanel } from "@/components/door-panel"; // created in next step
import { readDevice } from "@/lib/device";
import { forGym } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export default async function DoorPage() {
  const device = await readDevice();
  if (!device) redirect("/door/pair");

  const db = forGym(device.gymId);
  const todayStart = startOfDayUTC(new Date());

  // Pull only what the door surface needs.
  const [todayCount, gym] = await Promise.all([
    db.checkIn.count({
      where: { result: "GRANTED", scannedAt: { gte: todayStart } },
    }),
    prisma.gym.findUnique({
      where: { id: device.gymId },
      select: { name: true },
    }),
  ]);

  return (
    <DoorPanel
      gymName={gym?.name ?? "Zal"}
      deviceName={device.name}
      todayCount={todayCount}
    />
  );
}
```

- [ ] **Step 4: Create the door panel client component**

`src/components/door-panel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import { Scanner } from "@/components/scanner";
import { DoorManualLookup } from "@/components/door-manual-lookup";
import type { ScanResult } from "@/lib/scan-actions";

export function DoorPanel({
  gymName,
  deviceName,
  todayCount,
}: {
  gymName: string;
  deviceName: string;
  todayCount: number;
}) {
  const [manualResult, setManualResult] = useState<ScanResult | null>(null);

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{gymName}</div>
          <div className="text-[11px] text-[var(--muted)]">{deviceName}</div>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <Activity className="w-4 h-4 text-[var(--brand-strong)]" />
          <span className="font-semibold">{todayCount}</span>
          <span className="text-[var(--muted)]">bu gün</span>
        </div>
      </header>

      <div className="flex-1 p-4 space-y-4">
        <Scanner />
        <DoorManualLookup onResult={setManualResult} />
        {manualResult && (
          <div
            className={`card p-4 text-sm ${
              manualResult.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
            }`}
          >
            {manualResult.ok
              ? `Giriş verildi: ${manualResult.member.name}`
              : `İmtina: ${manualResult.reason}`}
          </div>
        )}
      </div>
    </main>
  );
}
```

`<Scanner>` is a client component that only calls `verifyScan`, and after Task 7 `verifyScan` accepts a device actor — no further changes to `<Scanner>` are needed.

- [ ] **Step 5: Typecheck**

```
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Smoke — full pairing happy path**

```
npm run dev
```

1. Log in as owner on a desktop browser. Open Prisma Studio.
2. Manually create a `ScannerDevice` row with `gymId` = your gym, `name = "Test phone"`, `pairingCode = "ABC123XY"`, `pairingExpiresAt` = 5 minutes from now.
3. In a private/incognito window (simulating the phone), visit `http://localhost:3000/door/pair/ABC123XY` → expect redirect to `/door` → expect the header to show your gym name, "Test phone", and "0 bu gün".
4. In another tab, log in as a member-with-active-status with QR. Display the rotating QR (use an existing pass page).
5. In the incognito window, scan or paste the QR token into the camera component (or use the existing scan flow). Expect green result. The counter rerenders (refresh the door page) to show 1.
6. Tap "Telefonu olmayan üzv?", search for the member, tap → expect green result. Counter goes to 2.
7. In Prisma Studio, check the new CheckIn rows: `scannedById` is null, `scannerDeviceId` is the new device's id. The earlier owner-driven scans (if any) still have `scannedById` set.

Stop the server.

- [ ] **Step 7: Commit**

```
git add src/app/door src/components/door-panel.tsx src/components/door-manual-lookup.tsx
git commit -m "feat(door): /door layout, page, manual lookup component"
```

---

## Task 11: Settings — `ScannerDevicesCard` + pair modal

**Files:**
- Create: `src/components/scanner-devices-card.tsx`
- Create: `src/components/pair-device-dialog.tsx`
- Modify: `src/app/settings/page.tsx`

The settings card lives between **Zalın profili** and **WhatsApp mesaj şablonları**. It lists active devices and opens a modal to pair a new one.

- [ ] **Step 1: Create the pair-device dialog (client)**

`src/components/pair-device-dialog.tsx`:

```tsx
"use client";

import { useState, useEffect, useTransition } from "react";
import { QRCodeSVG } from "qrcode.react";
import { X } from "lucide-react";
import {
  createScannerPairing,
  regeneratePairing,
  type PairingResult,
} from "@/lib/scanner-device-actions";

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export function PairDeviceDialog({ origin }: { origin: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pairing, setPairing] = useState<
    { deviceId: string; code: string; expiresAt: number } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!pairing) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pairing]);

  function start() {
    setError(null);
    const fd = new FormData();
    fd.append("name", name);
    startTransition(async () => {
      const result = await createScannerPairing(undefined, fd);
      if (result.ok) {
        setPairing({
          deviceId: result.deviceId,
          code: result.pairingCode,
          expiresAt: new Date(result.expiresAt).getTime(),
        });
      } else {
        setError(result.message);
      }
    });
  }

  function regen() {
    if (!pairing) return;
    setError(null);
    startTransition(async () => {
      const result: PairingResult = await regeneratePairing(pairing.deviceId);
      if (result.ok) {
        setPairing({
          deviceId: result.deviceId,
          code: result.pairingCode,
          expiresAt: new Date(result.expiresAt).getTime(),
        });
      } else {
        setError(result.message);
      }
    });
  }

  function close() {
    setOpen(false);
    setPairing(null);
    setName("");
    setError(null);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-brand">
        + Yeni cihaz əlavə et
      </button>
    );
  }

  const remaining = pairing ? pairing.expiresAt - now : 0;
  const expired = pairing !== null && remaining <= 0;
  const pairUrl = pairing ? `${origin}/door/pair/${pairing.code}` : "";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="card w-full max-w-md p-5 space-y-4 bg-[var(--card)]">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Skaner cihazını qoş</h2>
          <button onClick={close} aria-label="Bağla">
            <X className="w-4 h-4 text-[var(--muted)]" />
          </button>
        </div>

        {!pairing && (
          <>
            <label className="block text-sm font-medium">Cihazın adı</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Qapı telefonu"
              className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              onClick={start}
              disabled={isPending || name.trim().length < 2}
              className="btn-brand w-full"
            >
              {isPending ? "Yaradılır..." : "Davam et"}
            </button>
          </>
        )}

        {pairing && (
          <>
            <p className="text-sm text-[var(--muted)]">
              Telefonun kamerası ilə QR-ı skan et, yaxud aşağıdakı kodu daxil et.
            </p>
            <div className="flex justify-center bg-white p-3 rounded-md">
              <QRCodeSVG value={pairUrl} size={200} />
            </div>
            <div className="text-center font-mono text-base tracking-wider">
              {pairing.code}
            </div>
            <div className="text-center text-sm">
              {expired ? (
                <span className="text-red-600">Vaxtı keçdi</span>
              ) : (
                <span className="text-[var(--muted)]">
                  Qalan vaxt: {fmtCountdown(remaining)}
                </span>
              )}
            </div>
            {error && <p className="text-sm text-red-600 text-center">{error}</p>}
            <div className="flex gap-2">
              <button onClick={close} className="btn-ghost flex-1">
                Bağla
              </button>
              {expired && (
                <button
                  onClick={regen}
                  disabled={isPending}
                  className="btn-brand flex-1"
                >
                  Yeni kod yarat
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the scanner-devices card (server)**

`src/components/scanner-devices-card.tsx`:

```tsx
import { headers } from "next/headers";
import { Trash2 } from "lucide-react";
import { getOwnerDb } from "@/lib/dal";
import { revokeScannerDevice } from "@/lib/scanner-device-actions";
import { PairDeviceDialog } from "@/components/pair-device-dialog";

function fmtDateTime(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().replace("T", " ").slice(0, 16);
}

export async function ScannerDevicesCard() {
  const { db } = await getOwnerDb();
  const devices = await db.scannerDevice.findMany({
    where: { revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      lastSeenAt: true,
      tokenHash: true,
      createdAt: true,
    },
  });

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--muted)]">
        Qapıdakı telefonlar üçün skaner cihazları. Hər cihaz yalnız skan etmək
        üçün istifadə olunur.
      </p>

      {devices.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Hələ qoşulu cihaz yoxdur.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {devices.map((d) => (
            <li
              key={d.id}
              className="py-2 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{d.name}</div>
                <div className="text-[11px] text-[var(--muted)]">
                  {d.tokenHash
                    ? `Son giriş: ${fmtDateTime(d.lastSeenAt)}`
                    : "Qoşulma gözlənilir"}
                </div>
              </div>
              <form action={async () => {
                "use server";
                await revokeScannerDevice(d.id);
              }}>
                <button
                  className="text-red-600 hover:text-red-700 inline-flex items-center gap-1 text-sm"
                  aria-label="Sil"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Sil
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <PairDeviceDialog origin={origin} />
    </div>
  );
}
```

- [ ] **Step 3: Slot the card into settings**

Open `src/app/settings/page.tsx`. After the `Zalın profili` section and before the `WhatsApp mesaj şablonları` section, add:

```tsx
import { ScannerDevicesCard } from "@/components/scanner-devices-card";
```

And inside the page body, between the existing sections:

```tsx
        <Section title="Skanerlər">
          <ScannerDevicesCard />
        </Section>
```

The final ordering should be: Açıq qeydiyyat linki → Zalın loqosu → Zalın profili → **Skanerlər** → WhatsApp mesaj şablonları.

- [ ] **Step 4: Typecheck**

```
npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: End-to-end smoke**

```
npm run dev
```

1. Log in as owner. Visit `/settings`. Expect to see the new "Skanerlər" card showing "Hələ qoşulu cihaz yoxdur." and a "+ Yeni cihaz əlavə et" button.
2. Click the button. Modal opens. Enter "Qapı telefonu". Click "Davam et". Modal shows a QR + code + 5:00 countdown.
3. On a phone (or a private incognito window resized to phone dimensions), point the camera at the QR or visit the encoded URL. Expect redirect to `/door` with the gym name, device name, and "0 bu gün".
4. Back on the laptop, refresh `/settings`. The Skanerlər card now lists "Qapı telefonu · Son giriş: <recent>".
5. Click **Sil**. The row disappears (revoked). On the phone, refresh — expect redirect to `/door/pair` (since `readDevice` now returns null because the device row is revoked).
6. Test expiry: open the pair modal, wait 5 minutes (or shorten `PAIRING_TTL_MS` to 30 seconds locally for the test), confirm "Vaxtı keçdi" appears and "Yeni kod yarat" works.

Stop the server.

- [ ] **Step 6: Commit**

```
git add src/components/scanner-devices-card.tsx src/components/pair-device-dialog.tsx src/app/settings/page.tsx
git commit -m "feat(settings): Skanerlər card with pair modal and revoke"
```

---

## Final verification

- [ ] **Step 1: Typecheck clean**

```
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 2: Lint clean (warnings ok, errors not)**

```
npx eslint src/lib/device.ts src/lib/actor.ts src/lib/scanner-device-actions.ts src/app/door src/components/door-panel.tsx src/components/door-manual-lookup.tsx src/components/scanner-devices-card.tsx src/components/pair-device-dialog.tsx src/components/redeem-pairing-form.tsx
```

Expected: 0 errors. Warnings are fine if pre-existing.

- [ ] **Step 3: End-to-end happy path on real devices**

With dev server up and accessible from your phone (use `npm run tunnel` for HTTPS via cloudflared if needed — required because the camera API needs HTTPS on real mobile browsers):

1. Pair the phone from the laptop.
2. From the phone, scan an active member's rotating QR → green.
3. From the phone, scan a visitor day-pass QR → green (this exercises the earlier `verifyVisitorPassScan → getGymDb` fix end-to-end).
4. From the phone, use "Telefonu olmayan üzv?" → tap a member → green.
5. From the laptop, revoke the phone → next phone request → "Bu cihaz ləğv edilib".

- [ ] **Step 4: Sanity — no raw `prisma` regression on tenant models**

```
npx eslint --rule 'no-restricted-syntax: off' .  # noop sanity, real check below
```

Then manually verify the only **non-generated** raw-prisma tenant usages are still the intended exceptions (public token pages, signup, internal helpers with explicit gymId, plus the new redeemPairing which is intentionally raw since the phone is unauthed at that point):

```
npx eslint src 2>&1 | head -20    # just to ensure no new lint errors
```

Visual check via grep is fine: the new file `device.ts` uses raw `prisma` for the device lookup (correct — there's no actor yet), and `scanner-device-actions.ts` uses raw `prisma` in `redeemPairing` (correct — public action). All other tenant operations go through `db = forGym(...)`.

---

## Notes for the implementer

- **Don't add a test framework as part of this work.** The verification model is typecheck + manual smoke. If you feel a strong urge to add Vitest, open a separate PR.
- **Don't refactor `Scanner` or `verifyScan` beyond what the tasks ask.** The component's 30-second cooldown and busyRef behaviour was hard-won — leave it alone.
- **Don't add new tenant models without classifying them** in `tenant.ts`. The completeness guard will throw at startup. (That's the guard doing its job — pick the right set and move on.)
- **Cookie path is `/`**, not `/door`. The phone uses the cookie on `/door`, but if we later add `/api/door/*` endpoints they'll need it too.
- **`maxAge: 365 * 24 * 60 * 60`** for the device cookie is intentional. Owner-driven revoke is the only kill switch — if you want auto-expiry, that's a separate feature.
- **The pairing code window is 5 minutes.** Don't shorten without checking how long it realistically takes someone to scan a QR with a phone they're holding awkwardly.
- **`overrideScan` stays user-and-owner-only.** Devices don't override. If the owner wants to override a denied scan, they walk to the laptop.
