# GymPass — project overview

A multi-tenant gym management web app for small-to-medium gyms in Azerbaijan.
Owners self-sign-up, manage their members, track payments, and control door
access — all from one place. Staff only see the scanner.

---

## Who it's for

Small gym owners who currently track members in spreadsheets or WhatsApp groups.
The product is in Azerbaijani; pricing is in AZN.

---

## Core capabilities

### Members
Add members with a plan (monthly / quarterly / annual), price snapshot, start/expiry
dates, photo, and phone. Status transitions automatically: ACTIVE → OVERDUE →
EXPIRED, or manually to FROZEN / CANCELLED. Each member gets a unique `M-XXXXX`
ID visible in the UI.

### Payments
One payment row per billing period (`"2026-05"` format). Payments start as PENDING
and are marked PAID when cash/card/transfer is received. Optional receipt photo
upload. Payment history lives on the member detail page.

### QR door access
Each member has a permanent pass URL (`/pass/<memberId>/<urlToken>`) sent once via
WhatsApp. Opening that URL shows a **rotating QR that refreshes every 30 seconds**.
The scanner (a paired phone running `/door`) reads the QR and shows a green
GRANTED or red DENIED screen.

Three layers prevent sharing:
1. 30s rotating scan token — a forwarded screenshot is dead in ≤30s.
2. Device binding + phone-verify transfer — the pass mints tokens only from the
   one bound device; re-binding requires the last 4 digits of the member's phone.
3. Member photo on the GRANTED screen — staff see the face.

### Scanner / door
Any phone can be paired from the dashboard (`/door/pair`). Paired devices get a
long-lived httpOnly cookie; they use the `/scan` page to run the camera scanner.
Owners can also scan from `/scan` and can override a denial (logged). Unpaired
phones can't operate the door.

### Day passes (visitors / walk-ins)
Two flows:
- **Quick visit** — one tap, no QR. Owner enters amount + optional name; a
  `CheckIn` row is written immediately. Revenue counted toward the month.
- **Day pass with QR** — generates a single-day URL (`/visit/<passId>/<token>`)
  to WhatsApp to the visitor. They scan in like a member; the pass expires at
  midnight.

Visitor list is at `/visitors`; revenue rolls up into the dashboard.

### Leads / CRM
Inbound interest (walk-ins, referrals, etc.) is logged as a Lead. Status: NEW →
CONTACTED → CONVERTED / LOST. Converted leads become members in one click.
Dashboard shows a "new leads" alert card.

### WhatsApp reminders
Owners trigger reminders from `/reminders`: payment due, receipt confirmation,
membership expiry warning, welcome message. Templates are customisable per gym.
Messages open WhatsApp pre-filled for the member's phone number.

### Attendance heatmap
`/attendance` shows a 7 × 24 grid (day-of-week × hour-of-day) of GRANTED check-ins,
in Asia/Baku time. Tabs for 7 / 30 / 90 days. Useful for staffing, promotions,
off-peak discounts.

### Retention analytics
`/retention` surfaces at-risk members: "ghosters" (active membership but haven't
visited in 2+ weeks) and "lapsers" (expired / overdue). Quick action buttons to
WhatsApp them.

### Dashboard
Revenue summary for the current month (members + visitors), per-plan breakdown,
revenue-vs-goal bar, today's check-ins, members expiring soon, overdue payments.

### Audit log
Append-only. Every payment mutation, status change, QR transfer, scan override,
and invite writes a row. Queryable at `/audit` by owner.

### Staff role
STAFF users see only the Skaner page. All management pages are owner-only.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Server Actions, RSC) |
| Language | TypeScript / React 19 |
| Styling | Tailwind CSS |
| ORM | Prisma 6 → PostgreSQL |
| Auth | Session cookie (httpOnly, SHA-256 password hashing) |
| QR encoding | `qrcode.react` (client), HMAC-SHA256 (server) |
| Image storage | Local `/public/uploads/` (member photos) |

---

## Multi-tenancy model

Every row that belongs to a gym carries a `gymId` foreign key. The `forGym(gymId)`
helper in `src/lib/tenant.ts` scopes all queries. There is no row-level security
at the database layer — isolation is enforced in application code.

---

## Key files

| Path | Purpose |
|---|---|
| `prisma/schema.prisma` | Full data model |
| `src/lib/dal.ts` | `getCurrentUser()` — session → User + Gym |
| `src/lib/tenant.ts` | `forGym()` — scoped Prisma client |
| `src/lib/qr.ts` | Token signing / verification / hashing |
| `src/lib/qr-actions.ts` | `requestScanToken`, `transferPassDevice` |
| `src/lib/scan-actions.ts` | `verifyScan`, `verifyVisitorPassScan` |
| `src/lib/dashboard.ts` | Revenue + alert aggregation |
| `src/lib/attendance.ts` | Heatmap bucketing (Asia/Baku) |
| `src/components/rotating-qr.tsx` | Member pass page client |
| `src/components/scanner.tsx` | Door scanner client |
| `src/components/sidebar.tsx` | Nav + role gating |

---

## Further reading

- QR pass & door access mechanics: `docs/qr-pass-access.md`
- Phone-verify transfer design: `docs/superpowers/specs/2026-06-05-qr-binding-phone-verify-design.md`
