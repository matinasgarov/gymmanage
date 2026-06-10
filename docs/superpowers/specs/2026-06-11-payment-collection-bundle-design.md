# Payment collection bundle — design

**Date:** 2026-06-11
**Goal:** Make GymPass irresistible to new gym owners by attacking their #1 pain —
chasing payments — using touchpoints the app already owns. No external payment
gateway; works identically for cash, card, and bank-transfer gyms.

Three features, one story: *"You never chase anyone again. The door reminds them,
their own pass reminds them, and every morning the app hands you a 2-minute list."*

---

## 1. Grace entry with debt warning (amber door screen)

### Problem

`verifyScan` (src/lib/scan-actions.ts) denies entry whenever the current period's
payment is not PAID — even on day 1 of a new period. The 5-day grace in
`computeEffectiveStatus` (src/lib/payments.ts) only affects display labels, never
the door. Members get locked out before they are meaningfully late, and the owner
gets a confrontation instead of a payment.

### New behavior

| Effective payment status | Door result | Screen |
|---|---|---|
| PAID | GRANTED | Green (unchanged) |
| PENDING (within 5-day grace) | **GRANTED with debt warning** | **Amber**: photo, "GİRİŞ VAR", "Ödəniş gözlənilir: 50₼ (May) — 3 gün qalıb" |
| OVERDUE (past grace) | DENIED | Red (unchanged, owner override available) |

- Applies identically to `verifyScan` and `grantManualEntry`.
- `ScanResult`'s `ok: true` branch gains an optional field:
  `debt?: { amount: number; periodLabel: string; graceDaysLeft: number }`.
- Amount shown is the **sum of all unpaid payments** for the member (in practice
  only the current period can be unpaid while still within grace, since any older
  unpaid period is already OVERDUE and triggers a denial).
- The CheckIn row is a normal GRANTED row — no schema change.
- `OVERDUE_GRACE_DAYS = 5` becomes a single exported constant in
  `src/lib/payments.ts`; the duplicate in `src/app/reminders/page.tsx` is removed.
- No per-gym grace setting (YAGNI). Amber-grace entry is the default for all gyms.

### UI

`src/components/scanner.tsx` (and the door result screen it renders) gets a third
visual state: amber background, GRANTED semantics, debt line prominent enough for
staff to read at a glance. Member photo stays, as on green.

## 2. Renewal nudge on the pass page

The member opens `/pass/<memberId>/<urlToken>` at every visit — a free reminder
channel. The server-rendered pass page
(src/app/pass/[memberId]/[token]/page.tsx) gains a banner above the QR:

- **Unpaid payment exists** → amber banner: "Ödəniş gözlənilir: 50₼ (May)" plus a
  **"Zala yaz"** button — WhatsApp deep link to `gym.phone`, pre-filled message:
  "Salam, [gym adı] üzvlüyümü yeniləmək istəyirəm ([publicId])".
- **No debt, but `expiryDate` ≤ 7 days away** → soft banner: "Üzvlüyünüz X gün
  sonra bitir" with the same button.
- **Otherwise** → no banner; page stays clean.

The page calls `ensurePendingPayments(member.id)` before querying payments so the
debt state is current. The WhatsApp link uses the existing `buildWaUrl` helper
(src/lib/templates.ts). Texts go through the i18n layer like the rest of the page.

## 3. Morning collection queue

Upgrade `/reminders` from an overdue-only list into the owner's daily money inbox.

### Queue contents (priority order)

1. **Overdue** — unpaid payments past the 5-day grace (current behavior).
2. **Due now** — unpaid payments still within grace (new).
3. **Expiring soon** — members whose membership ends within 7 days and who have no
   pending payment row yet (new); uses the existing `waExpiringTemplate` instead
   of the reminder template.

Each card in the existing one-at-a-time queue UX
(src/components/reminder-queue.tsx) shows a group label; groups 1–2 keep the
payment-reminder template, group 3 uses the expiring template. Members who are
CANCELLED or FROZEN stay excluded, as today.

### Summary header

Above the queue: "Bu gün yığılacaq: 240₼ · 6 nəfər" — sum of unpaid amounts in
groups 1–2 plus head-count across all groups.

### Dashboard card

The dashboard gains an alert card: "6 nəfərdən 240₼ yığılmalıdır" linking to
`/reminders`. Hidden when the queue is empty. Aggregation lives next to the
existing alert queries in `src/lib/dashboard.ts`.

## Data flow / architecture notes

- No schema changes. All three features read existing `Payment`, `Member`, and
  `Gym` rows.
- Debt computation (sum of unpaid payments + effective status) is implemented
  once in `src/lib/payments.ts` and shared by the scan actions, the pass page,
  the reminders page, and the dashboard card.
- Tenancy: all queries go through the existing `forGym` / actor-scoped clients;
  the pass page continues to use the unscoped client guarded by
  `verifyPassUrlToken`, as today.

## Error handling

- Scan flow: if the debt computation fails unexpectedly, behavior degrades to
  today's logic (deny on unpaid) rather than granting silently.
- Pass page: a missing `gym.phone` (schema requires it, but defensively) hides
  the "Zala yaz" button, keeps the banner text.

## Testing

- Unit tests: effective-status/grace boundaries (day 0, day 5, day 6), debt sum
  with multiple unpaid periods, queue grouping (overdue vs due-now vs expiring,
  exclusion of CANCELLED/FROZEN), expiring-soon window edges.
- Manual verification: the three scanner outcomes (paid → green, pending → amber
  with amount, past grace → red), pass-page banner states, reminders queue
  grouping and summary, dashboard card link.

## Out of scope (deliberately)

- Online payment gateway integration (Epoint/Payriff) — phase 2; the pass-page
  banner becomes a pay button when it lands.
- Per-gym grace-days setting.
- Automated (server-sent) WhatsApp messages — all sends remain owner-tapped
  deep links.
