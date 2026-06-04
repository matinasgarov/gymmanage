# QR binding with phone-verify transfer — design

**Date:** 2026-06-05
**Status:** Approved, implementing
**Branch:** `feat/qr-phone-verify`

## Problem

The member pass at `/pass/[memberId]/[token]` is protected by a permanent URL
token plus a device binding (`Member.passDeviceHash`, a sha256 of a token held
in the bound phone's httpOnly cookie). Two defects:

1. **Breaks on cookie clear.** A member who clears their browser, upgrades the
   OS, or opens the pass in a new browser loses the cookie and hits the
   `needs_transfer` state. The old copy ("this card is active on another
   device") reads as a lockout.
2. **The binding did no real anti-sharing work.** With one-tap, last-device-wins
   transfer, a forwarded link let a friend tap once and walk in. The binding
   only blocked *simultaneous* use, which is trivially undone.

Meanwhile the real anti-sharing enforcement already exists and works: the door
scanner shows the member's **photo** on the GRANTED screen
(`src/components/scanner.tsx`), and the 30s rotating scan token kills forwarded
screenshots.

## Threat model

**Casual link-sharing** — a member forwards the pass URL to a friend or two.
The deterrent must make this annoying/visible, not cryptographically
impossible. Not in scope: an organized ring where everyone already knows the
member's phone number (the door photo covers that).

## Decision

Keep the binding, but make a **transfer require the member to prove identity**
by entering the **last 4 digits of the phone number on file**. A forwarded link
does not carry that knowledge, so a casual share cannot move the QR. The legit
member, after a cookie clear, types 4 digits they obviously know.

## Flow

Only the transfer branch changes.

- **First open** (`passDeviceHash == null`) → silent claim (trust-on-first-use),
  unchanged. Keeps onboarding frictionless.
- **Bound device** (cookie token hashes to `passDeviceHash`) → issue rotating
  scan token, unchanged.
- **Any other device** → show a 4-digit input instead of a one-tap button:
  *"Kartı bu telefonda açmaq üçün telefon nömrənizin son 4 rəqəmini daxil
  edin."*
  - Correct → re-bind (`passDeviceHash` overwritten, new cookie set), write
    `pass.device_transfer` audit row, issue scan token.
  - Wrong → `wrong_code` → *"Rəqəmlər uyğun gəlmir."*
  - Throttled → `rate_limited` → *"Çox cəhd. Bir azdan yenidən yoxlayın."*

## Brute-force protection

Four digits is 10,000 combinations — scriptable against the server action, so
transfer attempts are throttled. **5 wrong attempts → locked for 15 minutes.**

Two columns added to `Member`:

- `passTransferFails Int @default(0)`
- `passTransferLockedUntil DateTime?`

Logic in `transferPassDevice`:

1. If `passTransferLockedUntil != null`:
   - `now > lockedUntil` → lock expired: reset `passTransferFails = 0`,
     `lockedUntil = null`, continue.
   - else → return `rate_limited`.
2. Compare input to `digits(member.phone).slice(-4)` (timing-safe).
3. Mismatch → `passTransferFails++`; if it reaches 5, set
   `passTransferLockedUntil = now + 15min`. Return `wrong_code`.
4. Match → reset `passTransferFails = 0`, `passTransferLockedUntil = null`,
   rebind, log, issue scan.

Phone normalization: strip non-digits, take the last 4. `member.phone` is a
required column, always present.

## Components

1. **`prisma/schema.prisma`** — 2 columns on `Member`; migration
   `pass_transfer_verify`.
2. **`src/lib/qr-actions.ts`** — `transferPassDevice(memberId, urlToken, code)`:
   throttle + phone compare. `ScanTokenResult` union gains `wrong_code` and
   `rate_limited`. `requestScanToken` unchanged (still returns `needs_transfer`
   to trigger the form).
3. **`src/components/rotating-qr.tsx`** — `needs_transfer` view becomes a
   4-digit numeric form with `wrong` / `rate` error states.
4. **`src/app/members/[id]/page.tsx`** — passive visibility in the QR card:
   *"Kart N dəfə köçürülüb · son: <date>"*, derived from `pass.device_transfer`
   audit rows (gym-scoped `db`). No schema needed for this.

## Explicitly out of scope

- Cooldown-based transfer, dashboard "frequently transferred" list — passed on.
- Owner-preview bind suppression: if the owner clicks "Kartı aç" on a brand-new
  member, their browser silently claims the first bind (TOFU); the member
  phone-verifies once to take it over. Accepted as a minor caveat.

## Known residual risk

A friend who already knows the member's phone number can still transfer. This
is beyond "casual," and the door-photo check is the backstop. Documented, not
mitigated.
