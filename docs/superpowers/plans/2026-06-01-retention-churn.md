# Retention / Churn Win-Back Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface members at risk of churning (active-but-absent "ghosters" and recently-lapsed "lapsers") on a dedicated `/retention` page and a dashboard teaser card, each with a one-tap WhatsApp win-back message.

**Architecture:** A pure-query data module (`src/lib/retention.ts`) computes the two at-risk lists at request time from existing `CheckIn` and `Member` rows — no schema change, no migration. The `/retention` page (owner-only server component) renders the two lists; `getDashboard` gains a lightweight count helper that feeds a teaser card; the sidebar gains an owner-only nav item.

**Tech Stack:** Next.js 16.2.6 (App Router, RSC), React 19, Prisma 6.19.3 (`prisma-client` generator → `src/generated/prisma`), Tailwind v4, lucide-react icons.

> **No test runner in this project.** `package.json` exposes only `lint` and `typecheck` (no jest/vitest). Per-task verification is `npm run typecheck` plus the explicit manual checks each task spells out — matching this codebase's existing convention. Do **not** add a test framework.

> **AGENTS.md constraint:** "This is NOT the Next.js you know." Before writing any new page/route code, skim the relevant guide under `node_modules/next/dist/docs/`. The patterns in this plan are copied verbatim from existing working pages in this repo, so they already conform — but heed any deprecation notice you encounter.

---

## Spec

Design spec: `docs/superpowers/specs/2026-06-01-retention-churn-design.md`

## Definitions (locked — do not drift)

- **Ghoster:** `Member` with `status = ACTIVE` whose most recent `GRANTED` `CheckIn` was ≥ `GHOSTER_THRESHOLD_DAYS` (14) ago, OR who has never had a GRANTED check-in.
- **Lapser:** `Member` with `status IN (EXPIRED, CANCELLED)` whose relevant date (`cancelledAt` for CANCELLED, else `expiryDate`) is within the last `LAPSER_WINDOW_DAYS` (60).
- The two lists are **mutually exclusive** by status (ACTIVE vs EXPIRED/CANCELLED).

## Canonical type & signatures (used across all tasks — keep names exact)

```ts
export type RetentionKind = "ghoster" | "lapser";

export type MemberAtRisk = {
  id: string;
  name: string;
  phone: string;
  publicId: string;
  photoUrl: string | null;
  daysSince: number | null; // null = "never" (ghoster who never entered)
};

export type RetentionData = {
  ghosters: MemberAtRisk[];
  lapsers: MemberAtRisk[];
};

export type AtRiskCounts = {
  ghosters: number;
  lapsers: number;
  sample: string[]; // up to 3 names, ghosters first
};

export function getRetentionData(gymId: string): Promise<RetentionData>;
export function getAtRiskCounts(gymId: string): Promise<AtRiskCounts>;
export function winBackMessage(member: { name: string }, kind: RetentionKind): string;
```

## File Structure

- **Create** `src/lib/retention.ts` — data layer (`getRetentionData`, `getAtRiskCounts`, `winBackMessage`) + the two threshold constants. One responsibility: compute at-risk members.
- **Create** `src/app/retention/page.tsx` — owner-only page rendering the two lists. One responsibility: present retention data.
- **Modify** `src/lib/dashboard.ts` — add `getAtRiskCounts(gymId)` into the existing `Promise.all`; expose it on the returned object as `atRisk`.
- **Modify** `src/app/dashboard/page.tsx` — add the teaser card above the stat grid.
- **Modify** `src/components/sidebar.tsx` — add the owner-only "Geri qaytarma" nav item.

---

## Task 1: Data layer — `src/lib/retention.ts`

**Files:**
- Create: `src/lib/retention.ts`

Patterns copied from `src/lib/dashboard.ts`: `import "server-only"`, `forGym(gymId)`, the `startOfDayUTC`/`addDays` day-math, and `buildWaUrl` import from `src/lib/templates.ts` is NOT needed here (the page builds the URL); this module only produces the message string.

Confirmed schema facts (from `prisma/schema.prisma`): `Member` has `id, publicId, name, phone, photoUrl (String?), status, expiryDate, cancelledAt (DateTime?)`. `CheckIn` has `memberId (String?), result (GRANTED|DENIED), scannedAt`. `forGym` supports `groupBy` and injects `gymId` into the `where`.

- [ ] **Step 1: Write the module**

```ts
import "server-only";
import { forGym } from "@/lib/tenant";

export const GHOSTER_THRESHOLD_DAYS = 14;
export const LAPSER_WINDOW_DAYS = 60;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export type RetentionKind = "ghoster" | "lapser";

export type MemberAtRisk = {
  id: string;
  name: string;
  phone: string;
  publicId: string;
  photoUrl: string | null;
  daysSince: number | null;
};

export type RetentionData = {
  ghosters: MemberAtRisk[];
  lapsers: MemberAtRisk[];
};

export type AtRiskCounts = {
  ghosters: number;
  lapsers: number;
  sample: string[];
};

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

export async function getRetentionData(gymId: string): Promise<RetentionData> {
  const db = forGym(gymId);
  const now = new Date();
  const ghosterCutoff = new Date(now.getTime() - GHOSTER_THRESHOLD_DAYS * MS_PER_DAY);
  const lapserCutoff = new Date(now.getTime() - LAPSER_WINDOW_DAYS * MS_PER_DAY);

  const [activeMembers, lastGranted, lapsedMembers] = await Promise.all([
    db.member.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true, phone: true, publicId: true, photoUrl: true },
    }),
    db.checkIn.groupBy({
      by: ["memberId"],
      where: { result: "GRANTED" },
      _max: { scannedAt: true },
    }),
    db.member.findMany({
      where: {
        status: { in: ["EXPIRED", "CANCELLED"] },
        OR: [
          { cancelledAt: { gte: lapserCutoff } },
          { expiryDate: { gte: lapserCutoff } },
        ],
      },
      select: {
        id: true,
        name: true,
        phone: true,
        publicId: true,
        photoUrl: true,
        status: true,
        expiryDate: true,
        cancelledAt: true,
      },
    }),
  ]);

  // memberId -> last GRANTED scan time
  const lastSeen = new Map<string, Date>();
  for (const row of lastGranted) {
    if (row.memberId && row._max.scannedAt) {
      lastSeen.set(row.memberId, row._max.scannedAt);
    }
  }

  const ghosters: MemberAtRisk[] = [];
  for (const m of activeMembers) {
    const seen = lastSeen.get(m.id);
    if (!seen) {
      ghosters.push({ ...m, daysSince: null }); // never entered
    } else if (seen < ghosterCutoff) {
      ghosters.push({ ...m, daysSince: daysBetween(seen, now) });
    }
  }
  // Most at risk first: never-entered (null) on top, then longest absence.
  ghosters.sort((a, b) => {
    if (a.daysSince === null) return b.daysSince === null ? 0 : -1;
    if (b.daysSince === null) return 1;
    return b.daysSince - a.daysSince;
  });

  const lapsers: MemberAtRisk[] = lapsedMembers
    .map((m) => {
      const ref = m.status === "CANCELLED" ? (m.cancelledAt ?? m.expiryDate) : m.expiryDate;
      return {
        id: m.id,
        name: m.name,
        phone: m.phone,
        publicId: m.publicId,
        photoUrl: m.photoUrl,
        daysSince: daysBetween(ref, now),
      };
    })
    // Freshest lapsers first (best win-back targets).
    .sort((a, b) => (a.daysSince ?? 0) - (b.daysSince ?? 0));

  return { ghosters, lapsers };
}

export async function getAtRiskCounts(gymId: string): Promise<AtRiskCounts> {
  const { ghosters, lapsers } = await getRetentionData(gymId);
  const sample = [...ghosters, ...lapsers].slice(0, 3).map((m) => m.name);
  return { ghosters: ghosters.length, lapsers: lapsers.length, sample };
}

export function winBackMessage(member: { name: string }, kind: RetentionKind): string {
  if (kind === "ghoster") {
    return `Salam ${member.name}! Bir müddətdir səni zalda görmürük 💪 Bu həftə gəlib məşqə davam edək?`;
  }
  return `Salam ${member.name}! Üzvlüyün başa çatıb. Geri qayıt — səni zalda gözləyirik! 🔥`;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no errors). If Prisma complains that `_max.scannedAt` is possibly null, the code already guards with `if (... && row._max.scannedAt)`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/retention.ts
git commit -m "feat(retention): at-risk member query + win-back messages

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `/retention` page

**Files:**
- Create: `src/app/retention/page.tsx`

Owner-only via `getOwnerDb()` (from `src/lib/dal.ts`) — same gate other owner pages use; it redirects STAFF to `/dashboard`. We need `user.gymId` for the query and `user.gym` is not required here. Row markup, avatar fallback, and badge styling are copied from `src/app/members/page.tsx`; the green WhatsApp pill is copied from the overdue list in `src/app/dashboard/page.tsx` (lines ~115-122).

- [ ] **Step 1: Write the page**

```tsx
import Link from "next/link";
import { HeartPulse, UserMinus, CalendarX } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getOwnerDb } from "@/lib/dal";
import {
  getRetentionData,
  winBackMessage,
  type MemberAtRisk,
  type RetentionKind,
} from "@/lib/retention";
import { buildWaUrl } from "@/lib/templates";

export default async function RetentionPage() {
  const { user } = await getOwnerDb();
  const { ghosters, lapsers } = await getRetentionData(user.gymId);
  const total = ghosters.length + lapsers.length;

  return (
    <AppShell>
      <PageHeader
        title="Geri qaytarma"
        subtitle={`${total} üzv risk altında`}
        icon={HeartPulse}
        tone="dark"
      />

      <div className="px-4 lg:px-8 py-6 space-y-6">
        <RiskSection
          title="Gəlmir"
          hint="Aktiv, amma 14 gündür gəlməyən üzvlər"
          icon={UserMinus}
          kind="ghoster"
          members={ghosters}
          emptyText="Bütün aktiv üzvlər müntəzəm gəlir 🎉"
        />
        <RiskSection
          title="Üzvlüyü bitib"
          hint="Son 60 gündə üzvlüyü bitmiş və ya ləğv edilmiş üzvlər"
          icon={CalendarX}
          kind="lapser"
          members={lapsers}
          emptyText="Yaxınlarda üzvlüyü bitən yoxdur 🎉"
        />
      </div>
    </AppShell>
  );
}

function RiskSection({
  title,
  hint,
  icon: Icon,
  kind,
  members,
  emptyText,
}: {
  title: string;
  hint: string;
  icon: typeof UserMinus;
  kind: RetentionKind;
  members: MemberAtRisk[];
  emptyText: string;
}) {
  return (
    <section className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-[var(--brand-strong)]" />
          <h2 className="font-medium">{title}</h2>
        </div>
        <span className="text-xs text-[var(--muted)]">{members.length} nəfər</span>
      </div>
      <p className="text-xs text-[var(--muted)] mb-3">{hint}</p>

      {members.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {members.map((m) => (
            <RiskRow key={m.id} member={m} kind={kind} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RiskRow({ member, kind }: { member: MemberAtRisk; kind: RetentionKind }) {
  const badge =
    member.daysSince === null
      ? "Heç gəlməyib"
      : kind === "ghoster"
        ? `${member.daysSince} gündür gəlmir`
        : `${member.daysSince} gün öncə bitib`;

  const hasPhone = member.phone.trim().length > 0;
  const waUrl = hasPhone ? buildWaUrl(member.phone, winBackMessage(member, kind)) : null;

  return (
    <li className="py-2.5 flex items-center justify-between gap-2">
      <Link href={`/members/${member.id}`} className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-9 h-9 rounded-full bg-[var(--brand-soft)] text-[var(--brand-strong)] flex items-center justify-center text-sm font-semibold shrink-0 overflow-hidden">
          {member.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={member.photoUrl} alt={member.name} className="w-full h-full object-cover" />
          ) : (
            member.name.slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{member.name}</div>
          <div className="text-[11px] text-[var(--muted)]">
            {member.publicId} · {member.phone || "telefon yoxdur"}
          </div>
        </div>
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full hidden sm:inline">
          {badge}
        </span>
        {waUrl && (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-3 py-1"
          >
            WhatsApp
          </a>
        )}
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. Confirm `AppShell` and `PageHeader` import paths resolve (they are used identically in `src/app/members/page.tsx`).

- [ ] **Step 3: Manual verification**

Run `npm run dev`, log in as an OWNER, visit `/retention`. Expected:
- Page renders with header "Geri qaytarma" and the two sections.
- A member whose last GRANTED scan was ≥14 days ago appears under "Gəlmir" with "{n} gündür gəlmir".
- An ACTIVE member who never scanned appears under "Gəlmir" at the top with "Heç gəlməyib".
- A member EXPIRED/CANCELLED within 60 days appears under "Üzvlüyü bitib".
- Clicking WhatsApp opens wa.me with the prefilled Azerbaijani message.
- Empty sections show the friendly empty text.

- [ ] **Step 4: Commit**

```bash
git add src/app/retention/page.tsx
git commit -m "feat(retention): owner-only retention page with WhatsApp win-back

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Dashboard teaser card

**Files:**
- Modify: `src/lib/dashboard.ts`
- Modify: `src/app/dashboard/page.tsx`

### 3a — Wire `getAtRiskCounts` into `getDashboard`

In `src/lib/dashboard.ts`:

- [ ] **Step 1: Import the helper**

Add to the import block near the top (after the existing imports, e.g. below the `toCents, centsToNumber` import on line 4):

```ts
import { getAtRiskCounts } from "@/lib/retention";
```

- [ ] **Step 2: Call it in parallel and return it**

`getDashboard` currently has a `await Promise.all([...])` (ends ~line 131), then a couple of standalone `await`s (`visitorRevenueRow` ~line 134, `newLeadsCount` ~line 140). Add a parallel call alongside `newLeadsCount` so it adds no extra latency relative to those. Replace the `newLeadsCount` standalone await:

```ts
  const newLeadsCount = await db.lead.count({
    where: { status: "NEW" },
  });
```

with:

```ts
  const [newLeadsCount, atRisk] = await Promise.all([
    db.lead.count({ where: { status: "NEW" } }),
    getAtRiskCounts(gymId),
  ]);
```

Then add `atRisk` to the returned object — insert `atRisk,` next to `newLeadsCount,` in the final `return { ... }` (around line 196):

```ts
    newLeadsCount,
    atRisk,
  };
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS. `DashboardData` is `Awaited<ReturnType<typeof getDashboard>>`, so `data.atRisk` is now typed automatically for the page.

### 3b — Render the teaser card

In `src/app/dashboard/page.tsx`:

- [ ] **Step 4: Add the icon import**

The existing icon import (line 2) ends with `Inbox`. Add `HeartPulse`:

```ts
import { LayoutDashboard, Users, AlertTriangle, CalendarClock, ScanLine, TrendingUp, PieChart, TrendingDown, Inbox, HeartPulse } from "lucide-react";
```

- [ ] **Step 5: Add the teaser card markup**

Immediately after the closing `)}` of the existing `{data.newLeadsCount > 0 && ( ... )}` block (it ends around line 54, just before `<section className="grid grid-cols-2 lg:grid-cols-4 gap-3">`), insert:

```tsx
        {data.atRisk.ghosters + data.atRisk.lapsers > 0 && (
          <Link
            href="/retention"
            className="card p-4 flex items-center gap-3 hover:bg-[var(--brand-soft)]/40 border-[var(--brand)]/40 transition-colors"
          >
            <div className="w-10 h-10 rounded-full bg-[var(--brand-soft)] text-[var(--brand-strong)] flex items-center justify-center">
              <HeartPulse className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">
                {data.atRisk.ghosters + data.atRisk.lapsers} üzv risk altında
              </div>
              <div className="text-xs text-[var(--muted)] truncate">
                {data.atRisk.sample.length > 0
                  ? data.atRisk.sample.join(", ")
                  : "Gəlməyən və üzvlüyü bitən üzvlər"}
              </div>
            </div>
            <span className="text-[var(--brand-strong)] text-sm">→</span>
          </Link>
        )}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Manual verification**

`npm run dev`, OWNER login, visit `/dashboard`. Expected:
- When at least one member is at risk: the teaser card shows "{n} üzv risk altında" with up to 3 names, and clicking it navigates to `/retention`.
- When zero members are at risk: the card is absent.

- [ ] **Step 8: Commit**

```bash
git add src/lib/dashboard.ts src/app/dashboard/page.tsx
git commit -m "feat(retention): dashboard at-risk teaser card

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Sidebar nav item

**Files:**
- Modify: `src/components/sidebar.tsx`

The `ITEMS` array (lines ~32-72) already supports `ownerOnly` and an optional `match` predicate; visibility filtering by role is already implemented (line 87). The icon import block (lines 6-20) currently includes `Activity` etc. We add `HeartPulse`.

- [ ] **Step 1: Add the icon to the import**

In the `lucide-react` import block (ends with `Activity,` on line ~19), add `HeartPulse,`:

```ts
  Activity,
  HeartPulse,
} from "lucide-react";
```

- [ ] **Step 2: Add the nav item**

Insert a new entry in the `ITEMS` array. Place it right after the `/reminders` item (line ~63) so retention sits near the other owner engagement tools:

```ts
  { href: "/reminders", label: "Xatırlatmalar", icon: Megaphone, ownerOnly: true },
  {
    href: "/retention",
    label: "Geri qaytarma",
    icon: HeartPulse,
    match: (p) => p.startsWith("/retention"),
    ownerOnly: true,
  },
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Manual verification**

`npm run dev`. Expected:
- OWNER sees "Geri qaytarma" in the sidebar; clicking it opens `/retention` and the item shows as active.
- STAFF login does NOT see the item (filtered by `ownerOnly`).

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(retention): owner-only sidebar nav item

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] `npm run typecheck` — clean across the whole project.
- [ ] `npm run lint` — no new errors in the touched files.
- [ ] End-to-end manual pass: dashboard teaser → `/retention` → WhatsApp button opens with correct prefilled message; STAFF cannot reach the nav item; empty states render when no members qualify.

## Spec coverage check

- Ghosters (ACTIVE, ≥14d or never) — Task 1 `getRetentionData`, Task 2 "Gəlmir" section. ✅
- Lapsers (EXPIRED/CANCELLED within 60d) — Task 1, Task 2 "Üzvlüyü bitib" section. ✅
- Two separate Azerbaijani lists — Task 2. ✅
- One-tap WhatsApp win-back, fixed default messages — Task 1 `winBackMessage` + Task 2 `buildWaUrl`. ✅
- Dashboard teaser (count + top 3 names) — Task 3. ✅
- Owner-only access + sidebar item — Task 2 (`getOwnerDb`), Task 4. ✅
- No schema change / migration — confirmed; no `prisma/schema.prisma` edits in any task. ✅
- Phone-less member edge case — Task 2 `RiskRow` hides the WhatsApp button, still lists the member. ✅
```
