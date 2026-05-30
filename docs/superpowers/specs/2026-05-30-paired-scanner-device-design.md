# Paired Scanner Device — Design

## Context

The dashboard is laptop-shaped: dense tables, sidebar nav, multiple cards per page. It works poorly on a phone held one-handed at the gym door. Today the owner uses one device for both: the same `/scan` page lives behind the same login as the dashboard. The owner has asked to **separate the two roles**:

- **Laptop** keeps the full dashboard (members, payments, leads, audit, settings) — the management surface.
- **Phone** runs a stripped-down scanner UI bound to one gym — the door surface.

The phone should not require a fresh login every day, should not show any dashboard data, and should be revocable from the laptop if it's lost or replaced.

## Goal

Let the owner pair a phone from the laptop in under a minute, then use that phone as a permanent door scanner with three capabilities: scan QR, manual lookup fallback, today's check-in counter. No other access.

## Non-goals (v1)

- **Override-deny on the phone.** Owners override denied scans only from the laptop. Same as today.
- **Visitor pass creation on the phone.** Quick visits and day-passes are owner actions on the laptop. The phone only *scans* already-issued day-pass QRs (already enabled by the recent `verifyVisitorPassScan` → `getGymDb` fix).
- **Offline mode.** A phone with no connection can't scan. Out of scope for v1.
- **Multiple gyms on one device.** A device is bound to exactly one gym.

## Architecture

The phone runs a new `/door` route group, served by the same Next.js app but gated by a **device cookie** instead of the user session cookie. Server actions called from `/door` use a new `getDeviceDb()` helper that returns `{ device, db: forGym(device.gymId) }` — analogous to `getGymDb()` / `getOwnerDb()`, so all tenant isolation work already in place applies unchanged.

Three pieces of new plumbing:

1. **`ScannerDevice` model** in the schema.
2. **CheckIn attribution change** — a new nullable `scannerDeviceId` so audit shows the device name when the scanner was a paired device.
3. **Device auth layer** (`src/lib/device.ts`) — cookie read, hash verification, last-seen bump.

Everything else (the camera component, `verifyScan`, manual lookup, tenant scoping) is reused.

## Schema

```prisma
model ScannerDevice {
  id                String    @id @default(cuid())
  gymId             String
  name              String    // "Qapı telefonu"
  // sha256(token) — raw token only exists in the phone's cookie
  tokenHash         String?   @unique
  // One-time pairing code; valid only until pairingExpiresAt
  pairingCode       String?   @unique
  pairingExpiresAt  DateTime?
  lastSeenAt        DateTime?
  revokedAt         DateTime?
  createdAt         DateTime  @default(now())

  gym      Gym       @relation(fields: [gymId], references: [id], onDelete: Cascade)
  checkIns CheckIn[]

  @@index([gymId, revokedAt])
}
```

```prisma
model CheckIn {
  // ... existing fields ...
  scannerDeviceId String?
  scannerDevice   ScannerDevice? @relation(fields: [scannerDeviceId], references: [id], onDelete: SetNull)
}
```

`ScannerDevice` joins the `TENANT_MODELS` set in `tenant.ts` (has `gymId`). The load-time completeness guard will fail until it's added — that's the guard doing its job.

The existing `CheckIn` CHECK constraint (`memberId XOR visitorPassId`) is unchanged. `scannedById` (User) and `scannerDeviceId` are independent: at most one is set, both nullable. A device-driven scan writes `scannerDeviceId = device.id, scannedById = null`. A staff/owner scan keeps the existing shape.

## Pairing flow

### Step 1 — owner creates a pairing (laptop)

`Tənzimləmələr → Skanerlər → + Yeni cihaz əlavə et` opens a small modal:

- Input: device name (e.g. "Qapı telefonu")
- Action: `createScannerPairing(name)` (owner-only server action) — creates `ScannerDevice` with:
  - `name`
  - `pairingCode`: 10-char URL-safe random (`crypto.randomBytes(8).base64url`)
  - `pairingExpiresAt`: `now + 5 min`
  - `tokenHash`, `lastSeenAt`, `revokedAt`: null
- Returns `{ pairingCode, pairUrl }`

### Step 2 — laptop displays the pairing

Modal shows a large QR encoding `https://<host>/door/pair/<pairingCode>` and, below the QR, the same code in human-typeable form (`ABCD-EFGH-IJ` style). Either path leads to the same endpoint.

A countdown ("5:00 → 0:00") makes the expiry visible. When it hits zero, the modal shows "Vaxtı keçdi — yenidən başlayın" and a regenerate button (which calls `createScannerPairing` again on the same `ScannerDevice` row).

### Step 3 — phone redeems the code

Phone opens `/door/pair/<code>` (a public, *un-authenticated* page — no session, no device cookie required yet). Server action `redeemPairing(code)`:

1. Find `ScannerDevice` by `pairingCode` (raw `prisma`, since the phone has no auth yet).
2. Reject if not found, already redeemed (`tokenHash != null`), revoked, or expired.
3. Mint a 32-byte token: `crypto.randomBytes(32).base64url`.
4. In a transaction: set `tokenHash = sha256(token)`, `pairingCode = null`, `pairingExpiresAt = null`, `lastSeenAt = now()`.
5. Set cookie: `gympass_scanner_device = <token>`; `httpOnly`, `secure`, `sameSite=lax`, `path=/`, `maxAge = 365d`.
6. Audit log: `device.paired` with payload `{ deviceId, name }`.
7. Redirect to `/door`.

The raw token never enters the database and never leaves the phone after this redirect.

### Step 4 — daily use

The phone navigates to `/door`. The new `readDevice()` helper reads the cookie, hashes it, looks up the device by `tokenHash`, rejects if `revokedAt != null`, bumps `lastSeenAt` (best-effort, no transaction), returns the device. If the cookie is missing or invalid, the phone is redirected to `/door/pair` — a public page showing "Bu cihaz qoşulu deyil. Sahibinizdən kod istəyin." with a code input.

### Step 5 — revocation

On the laptop's Skanerlər card, each device row has a **Sil** button. `revokeScannerDevice(deviceId)` (owner-only) sets `revokedAt = now()`. The phone's next request fails `readDevice()` and is redirected to a "Bu cihaz ləğv edilib" page (no auto-recovery — owner must pair again from scratch).

Past `CheckIn` rows referencing a deleted device retain `scannerDeviceId` (the relation is `onDelete: SetNull`, but for revocation we only set `revokedAt`; we don't delete the row). Audit history stays intact.

## /door UI

A single page with no sidebar, no top nav, full-bleed for phone screens:

- **Header strip**: gym name + small device label ("Qapı telefonu") so the owner can tell which device they're holding.
- **Today's counter**: `X giriş bu gün` — a server-rendered count of `CheckIn` rows with `gymId = device.gymId`, `result = GRANTED`, `scannedAt >= todayStart`. Re-rendered after every scan (the scan result page does a soft revalidate of `/door`).
- **Scanner**: reuse the existing `<Scanner>` client component verbatim. It calls `verifyScan(token)` — which already works with `getGymDb()` after the earlier fix, so it works for devices as soon as a tiny tweak lets it accept either a user session or a device. (See "Auth dispatch" below.)
- **Result screen**: same green/red as today.
- **Manual lookup**: a small "Telefonu olmayan üzv?" link under the camera opens an inline search powered by the existing `manualLookup` server action. Tapping a result calls a new `grantManualEntry(memberId)` server action that runs the same status + payment checks `verifyScan` does and writes a `CheckIn` with `scannerDeviceId` set. (We don't reuse `overrideScan` — that bypasses the checks and is owner-only.)

## Auth dispatch

`verifyScan`, `manualLookup`, and `grantManualEntry` need to work when called by **either** a session user **or** a paired device. Two clean options:

- **(a) Separate device-only server actions** (`verifyScanFromDevice`, etc.) that mirror the user ones — duplicated logic, easy to read.
- **(b) A unified `getActorDb()`** that returns `{ actor: User | Device, db }` and a small helper to attribute scans correctly. Less duplication, slightly more indirection.

Recommendation: **(b)**. The existing actions already have one call site each, the bodies are short, and the alternative leaves us with two near-identical scan pipelines that will drift. `getActorDb()` reads the user session first; falls back to the device cookie; throws if neither.

## Audit attribution

Scan events write `CheckIn` rows, not `AuditLog` rows (only `checkin.override` writes audit, and override stays owner-only on the laptop). So for v1 there is no existing display surface that needs to switch its rendering — the audit page and member detail page both still show user-attributed rows correctly.

We add `actorLabel({ scannedBy, scannerDevice })` as a small helper for future use, and use it in the new Skanerlər card's "last seen" line for consistency:

```ts
function actorLabel(row: { scannedBy?: User | null; scannerDevice?: ScannerDevice | null }): string {
  if (row.scannedBy) return row.scannedBy.name;
  if (row.scannerDevice) return row.scannerDevice.name;
  return "Sistem";
}
```

Two new `AuditLog` actions: `device.paired` (written from `redeemPairing` — actor is null since the phone is unauthenticated; payload `{ deviceId, name }`) and `device.revoked` (actor is the owner who clicked Sil). These are the only new audit rows introduced.

## Failure modes

- **Pairing code expired**: phone sees "Kod vaxtı keçib. Sahibinizdən yeni kod istəyin." Laptop modal independently shows the same.
- **Pairing code already redeemed**: rejected as "etibarsız kod". (Prevents two phones from claiming the same code.)
- **Cookie cleared on phone**: phone falls through to `/door/pair`. Owner pairs again — old device row stays revoked-or-redeemable depending on state; cleanest is a fresh pairing for a fresh row.
- **Device revoked while phone is mid-scan**: next request hits `readDevice()` → null → redirect to "Bu cihaz ləğv edilib". The in-flight scan completes if it was already submitted; subsequent ones don't.
- **Token leaked**: revoke the device. There's no other recovery — by design, the raw token is not in the DB.

## Files to add / change

- `prisma/schema.prisma` — `ScannerDevice` model, `CheckIn.scannerDeviceId`, back-relations on `Gym` and `User`.
- `prisma/migrations/<ts>_scanner_devices/` — migration.
- `src/lib/tenant.ts` — add `"ScannerDevice"` to `TENANT_MODELS`.
- `src/lib/device.ts` (new) — `readDevice()`, `setDeviceCookie()`, `clearDeviceCookie()`, `getDeviceDb()`.
- `src/lib/actor.ts` (new) — `getActorDb()` (session-first, device-fallback).
- `src/lib/scanner-device-actions.ts` (new) — `createScannerPairing`, `regeneratePairing`, `revokeScannerDevice`, `redeemPairing`, `grantManualEntry`.
- `src/lib/scan-actions.ts` — switch `verifyScan` and `manualLookup` from `getGymDb()` to `getActorDb()`; write `scannerDeviceId` when the actor is a device.
- `src/app/door/layout.tsx` (new) — full-bleed phone shell, no `AppShell`.
- `src/app/door/page.tsx` (new) — header + counter + scanner + manual-lookup link.
- `src/app/door/pair/page.tsx` (new) — public; code input + auto-redeem if code in URL.
- `src/app/door/pair/[code]/page.tsx` (new) — public; auto-redeems and redirects to `/door`.
- `src/app/door/revoked/page.tsx` (new) — public; "Bu cihaz ləğv edilib".
- `src/app/settings/page.tsx` — add a `<ScannerDevicesCard>` between profile and templates.
- `src/components/scanner-devices-card.tsx` (new) — list + pair modal + revoke.
- `proxy.ts` — exempt `/door/*` from the user-session redirect; let the page-level `readDevice()` handle auth.
- `src/components/audit-row.tsx` / `src/app/audit/page.tsx` / member detail — switch to the `actorLabel` helper for scan rows.

## Open questions

None blocking. The pairing-code shape (10 URL-safe chars vs 6-digit numeric vs both) is a UX call; spec uses one URL-safe code shown two ways (QR + human-typeable). If the owner finds 10 chars too painful to type when the camera fails, drop to a 6-digit numeric and accept a slightly weaker collision space (10⁶ codes × 5-minute window is still safe).

## Verification

After migration + dev server:

1. Pair flow — laptop creates pairing, phone redeems (via QR scan AND via typed code), `/door` loads, daily counter shows zero.
2. Scan a member's rotating QR from `/door` — green result, counter ticks to 1, audit shows "Qapı telefonu".
3. Manual lookup — search for the same member, tap → granted, counter ticks to 2, audit shows manual entry.
4. Visitor day-pass scan from `/door` — green, counter ticks. (Validates the earlier `getOwnerDb → getGymDb` fix.)
5. Revoke device from laptop — phone's next request lands on `/door/revoked`.
6. Expired pairing — wait 5 minutes, try to redeem → rejected.
7. `npx tsc --noEmit` clean. Startup completeness guard in `tenant.ts` does not throw (ScannerDevice is classified).
