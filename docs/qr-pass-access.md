# QR pass & door access

How a member gets through the door, and what stops a shared link from working.
Reference for maintainers — last updated 2026-06-05.

## The pieces

A member has a **permanent pass page** at `/pass/<memberId>/<urlToken>`. The
owner sends this link once (WhatsApp); the member bookmarks it / adds it to the
home screen. The page shows the member's photo, status, and a **QR that rotates
every 30 seconds**. At the door, staff (or a paired scanner phone) scans that QR.

Three independent mechanisms protect entry. None of them alone is the whole
story — they cover different gaps.

| Mechanism | Defends against | Where |
|---|---|---|
| Rotating 30s scan token | Forwarded **screenshots** (dead in ≤30s) | `src/lib/qr.ts` |
| Device binding + phone-verify transfer | A forwarded **link** minting live QRs elsewhere | `src/lib/qr-actions.ts` |
| Member photo on the GRANTED screen | A different **person** using a valid pass | `src/components/scanner.tsx` |

## Tokens (`src/lib/qr.ts`)

Two different tokens, do not confuse them:

- **Pass URL token** — `HMAC-SHA256("pass:<memberId>", member.qrSecret)`,
  base64url. Permanent. Proves the holder of the link is authorized to view the
  pass page. Verified with a timing-safe compare in `verifyPassUrlToken`.
- **Rotating scan token** — `"<memberId>.<window>.<hmac>"` where `window =
  floor(now / 30s)` and the HMAC is keyed by `QR_SIGNING_SECRET + member.qrSecret`.
  This is what the QR encodes. The scanner accepts the current window ±1
  (`verifyScanToken`), so a token lives ~30–60s. A screenshot is useless almost
  immediately.

`QR_SIGNING_SECRET` is a server env var; `qrSecret` is per-member. Both are
required to forge a scan token, and neither is exposed to the client.

## Device binding (`src/lib/qr-actions.ts`)

The pass page can only mint rotating scan tokens from the **one device it is
bound to**. Binding is a cookie/DB pair that mirrors the `ScannerDevice` pattern:

- The bound device holds a random opaque token in an **httpOnly cookie**
  `gympass_pass_<memberId>` (1 year, `SameSite=Lax`).
- The `Member` row stores only `sha256(token)` in `passDeviceHash` — the raw
  token never touches the database.

`requestScanToken(memberId, urlToken)` resolves one of three ways:

1. **`passDeviceHash == null`** → first open. Silent claim
   (trust-on-first-use): set the cookie, store the hash, issue a scan token.
2. **cookie hashes to `passDeviceHash`** → the bound device. Issue a scan token.
3. **anything else** → `needs_transfer`. The pass is bound to some other
   device; this one must verify before it can take over.

### Phone-verify transfer

`needs_transfer` is what a member hits after clearing cookies, switching
browsers, or getting a new phone — and also what a friend hits if the link was
forwarded. To move the binding, the caller must enter the **last 4 digits of the
phone number on file**:

```
transferPassDevice(memberId, urlToken, code)
  → throttle check (see below)
  → digitsEqual(code, last4(member.phone))   // timing-safe
      mismatch → { status: "wrong_code" }     // (or "rate_limited" once locked)
      match    → overwrite passDeviceHash, new cookie, audit log, issue token
```

The real member knows those digits; a forwarded link alone does not carry them.
On success the old device's cookie no longer matches, so it silently drops to
`needs_transfer` on its next open — last device wins.

Each successful transfer writes a `pass.device_transfer` **audit row**
(`actorId: null` — the member, not a staff user, initiated it). The member
detail page surfaces the count: *"Kart N dəfə köçürülüb · son: <date>"*, tinted
amber at ≥5, so an over-shared pass is visible to the owner.

### Brute-force throttle

Four digits is only 10,000 combinations, so transfer attempts are throttled with
two columns on `Member`:

- `passTransferFails Int @default(0)`
- `passTransferLockedUntil DateTime?`

Rules (all in `transferPassDevice`):

- A live lock (`passTransferLockedUntil > now`) → `rate_limited`, no compare.
- An expired lock is cleared before comparing (fresh window).
- Each wrong code increments `passTransferFails`; reaching **5** sets a
  **15-minute** lock.
- A correct code resets both columns to zero/null.

The throttle is server-side state, so it holds even against a script hitting the
action directly — not just a disabled button in the UI.

## Door enforcement (`src/lib/scan-actions.ts`, `src/components/scanner.tsx`)

`verifyScan` validates the scan token, then checks member status and the current
period's payment, writing a `CheckIn` (GRANTED/DENIED) either way. The GRANTED
overlay shows the member's **photo** large next to their name. This is the
backstop the software cannot enforce on its own: staff sees the face. A pass
shared with someone who looks nothing like the photo is caught here regardless
of tokens or binding.

Owners can override a denial (logged as `checkin.override`); paired scanner
devices cannot.

## Threat model & residual risk

Designed for **casual link-sharing** (a member forwards the URL to a friend or
two). That case is now blocked: the friend has the link but not the phone digits,
and the throttle stops guessing.

Known gaps, accepted by design:

- A friend who **already knows the member's phone number** can transfer. Beyond
  "casual"; the door photo is the backstop.
- **Owner preview:** if the owner clicks "Kartı aç" on a brand-new member, their
  browser performs the first silent claim (TOFU). The member then phone-verifies
  once to take it over. Minor; not mitigated.

## Files

- `src/lib/qr.ts` — token signing/verifying, device-token hashing.
- `src/lib/qr-actions.ts` — `requestScanToken`, `transferPassDevice`, cookies.
- `src/components/rotating-qr.tsx` — pass-page client: QR, countdown, transfer form.
- `src/app/pass/[memberId]/[token]/page.tsx` — the public pass page.
- `src/lib/scan-actions.ts` / `src/components/scanner.tsx` — door scan + result.
- `prisma/schema.prisma` — `Member.passDeviceHash/passBoundAt/passTransferFails/
  passTransferLockedUntil`, `qrSecret`.

Design history: `docs/superpowers/specs/2026-06-05-qr-binding-phone-verify-design.md`.
