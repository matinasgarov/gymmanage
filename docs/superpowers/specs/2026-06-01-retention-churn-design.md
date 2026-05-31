# Retention / Churn Win-Back — Design

**Date:** 2026-06-01
**Status:** Approved (brainstorming) → ready for implementation plan

## Problem

Small gym owners in Azerbaijan lose revenue silently: members stop showing up
weeks before their membership lapses, and lapsed members are never followed up
with. The app already records every `CheckIn`, knows each `Member`'s status /
`expiryDate` / `phone`, and has a WhatsApp deep-link helper (`buildWaUrl`). None
of that signal is surfaced to the owner today.

Goal: surface members who are at risk of churning and give the owner a one-tap
WhatsApp win-back message — no new data collection, no manual tracking.

## Scope & decisions

- **Two at-risk groups, shown as separate lists:**
  - **Ghosters** — `ACTIVE` members whose most recent `GRANTED` check-in was
    ≥ 14 days ago, or who have never checked in.
  - **Lapsers** — members whose status is `EXPIRED` or `CANCELLED` within the
    last 60 days.
- **Surfaces in two places:** a teaser card on `/dashboard` (count + top 3
  names) and a full dedicated `/retention` page.
- **Threshold:** 14 days for ghosters; 60-day look-back window for lapsers.
- **Win-back message:** fixed Azerbaijani defaults (not owner-customizable in v1).
- **Implementation approach (chosen):** pure query at request time. A `groupBy`
  on `CheckIn` for the last GRANTED check-in per member plus a `findMany` on
  `Member`. **No schema changes, no migration.**
- **UI language:** Azerbaijani.
- **Access:** owner-only (consistent with other reporting pages).

Out of scope for v1: customizable templates, automated/scheduled messaging,
SMS/email channels, configurable thresholds, "snooze/dismiss" per member.

## Architecture

Three units:

1. **`src/lib/retention.ts`** — data + message helpers (no schema change).
2. **`src/app/retention/page.tsx`** — the full page (owner-only server component).
3. **Dashboard teaser card + sidebar item** — entry points into the page.

### 1. Data layer — `src/lib/retention.ts`

All queries are tenant-scoped via `forGym(gymId)` (same pattern as
`src/lib/dashboard.ts`).

Constants:
```ts
const GHOSTER_THRESHOLD_DAYS = 14;
const LAPSER_WINDOW_DAYS = 60;
```

Type:
```ts
type RetentionKind = "ghoster" | "lapser";

type MemberAtRisk = {
  id: string;
  name: string;
  phone: string;
  publicId: string;
  photoUrl: string | null;
  // Ghoster: days since last GRANTED check-in, or null if never checked in.
  // Lapser: days since expiry/cancellation.
  daysSince: number | null;
};
```

**`getRetentionData(gymId): Promise<{ ghosters: MemberAtRisk[]; lapsers: MemberAtRisk[] }>`**
— used by the `/retention` page.

Ghosters:
1. `member.findMany` where `status = ACTIVE` (select id, name, phone, publicId,
   photoUrl).
2. `checkIn.groupBy({ by: ["memberId"], where: { result: "GRANTED" },
   _max: { scannedAt } })` → last GRANTED visit per member.
3. Join in JS: a member is a ghoster when their max `scannedAt` is null (never)
   or older than `now - 14 days`. `daysSince` = floor((now - scannedAt)/day),
   or `null` when never. Sort by "most at risk first": never-visited first,
   then largest `daysSince`.

Lapsers:
4. `member.findMany` where `status IN (EXPIRED, CANCELLED)` and
   (`expiryDate >= now - 60d` OR `cancelledAt >= now - 60d`). `daysSince` =
   days since the relevant date (cancelledAt for CANCELLED, expiryDate for
   EXPIRED). Sort most-recent-first (freshest lapsers are the best win-back
   targets).

**`getAtRiskCounts(gymId): Promise<{ ghosters: number; lapsers: number; sample: string[] }>`**
— lightweight version for the dashboard. Runs the same logic but returns only
counts plus the first 3 member names (`sample`) for the teaser. Implemented by
calling the same internal helpers as `getRetentionData` to avoid duplicated
logic; it just projects down to counts + sample.

**`winBackMessage(member: { name: string }, kind: RetentionKind): string`** —
returns the fixed Azerbaijani default message:
- Ghoster: greeting that they've been missed, invite back this week.
- Lapser: note membership ended, warm invite to return.

Consumed via `buildWaUrl(member.phone, winBackMessage(member, kind))`.

### 2. Page — `src/app/retention/page.tsx`

Server component, owner-only (same gate other owner pages use). Mirrors
`src/app/members/page.tsx` structure:

- `getCurrentUser()` → `getRetentionData(user.gymId)`.
- `AppShell` + `PageHeader` (title **"Geri qaytarma"**, dark tone, an icon such
  as `HeartPulse`/`UserMinus`, subtitle with the total at-risk count).
- Two section cards:
  - **"Gəlmir"** (ghosters): each row = avatar (photoUrl → initial fallback),
    name, `publicId · phone`, badge **"{n} gündür gəlmir"** or **"Heç
    gəlməyib"**, and a green WhatsApp win-back button (`MessageCircle`).
  - **"Üzvlüyü bitib"** (lapsers): same row layout, badge showing days since
    expiry/cancel.
- Empty state per section: friendly line (e.g. "Hamı aktivdir 🎉") instead of an
  empty card.

The WhatsApp button is a normal link (`<a href={buildWaUrl(...)} target="_blank">`),
matching how reminder links work elsewhere — no client component needed.

### 3. Dashboard teaser + sidebar

- `src/lib/dashboard.ts`: add `getAtRiskCounts(gymId)` into the existing
  `Promise.all` so `getDashboard` returns `atRisk: { ghosters, lapsers,
  sample }` with no extra latency beyond its two queries.
- `src/app/dashboard/page.tsx`: render a teaser card only when
  `ghosters + lapsers > 0` — headline **"{n} üzv risk altında"**, top-3 sample
  names, and a **"Hamısına bax →"** button linking to `/retention`. Visual tone
  mirrors the existing `newLeadsCount` banner (subtle accent, not alarm-red).
- `src/components/sidebar.tsx`: add an owner-only **"Geri qaytarma"** nav item
  pointing at `/retention`.

## Data flow

```
/dashboard  → getDashboard(gymId) → [..., getAtRiskCounts(gymId)]
                                       → teaser card → link to /retention

/retention  → getRetentionData(gymId)
               → ghosters[], lapsers[]
               → each row → buildWaUrl(phone, winBackMessage(member, kind))
               → owner taps → WhatsApp opens with prefilled message
```

## Error handling & edge cases

- **Member with no phone:** still listed, but the WhatsApp button is disabled /
  hidden (can't build a wa.me link). Show the row so the owner is aware.
- **Never-checked-in active member:** counts as a ghoster with `daysSince = null`
  → "Heç gəlməyib" badge, sorted to the top.
- **Member both EXPIRED and recently inactive:** lapser logic only considers
  EXPIRED/CANCELLED status, ghoster logic only ACTIVE — the status partition
  makes the two lists mutually exclusive, so no double-listing.
- **Empty gym / brand-new gym:** both lists empty → friendly empty states; no
  teaser card on the dashboard.
- **Timezone:** day math uses the same UTC day-boundary helpers already in
  `src/lib/dashboard.ts` (`startOfDayUTC`, `addDays`) for consistency.

## Testing / verification

After implementation, with `npm run dev` + seeded data:

1. A member with last GRANTED check-in 20 days ago appears under "Gəlmir" with
   "20 gündür gəlmir". A member who checked in yesterday does not.
2. An ACTIVE member who never checked in appears with "Heç gəlməyib" at the top.
3. A member EXPIRED 10 days ago appears under "Üzvlüyü bitib"; one expired 90
   days ago does not (outside 60-day window).
4. Tapping a WhatsApp button opens wa.me with the correct prefilled Azerbaijani
   message and the member's phone.
5. Dashboard shows "{n} üzv risk altında" with 3 names; clicking goes to
   `/retention`. With zero at-risk members, the card is absent.
6. STAFF role does not see the "Geri qaytarma" sidebar item; owner does.
7. `npm run typecheck` clean.

## Files

- `src/lib/retention.ts` (new)
- `src/app/retention/page.tsx` (new)
- `src/lib/dashboard.ts` (modify — add `getAtRiskCounts` to the parallel batch)
- `src/app/dashboard/page.tsx` (modify — teaser card)
- `src/components/sidebar.tsx` (modify — owner-only nav item)

## Reusable patterns to copy

- Tenant-scoped parallel queries → `src/lib/dashboard.ts` (`forGym`, `Promise.all`).
- Member list rows (avatar, status badge, formatAZN) → `src/app/members/page.tsx`.
- Teaser banner with link → existing `newLeadsCount` block in
  `src/app/dashboard/page.tsx`.
- WhatsApp deep link → `buildWaUrl` from `src/lib/templates.ts`.
