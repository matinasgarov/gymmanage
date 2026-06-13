# Monthly Recap + Collection Follow-through Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Ayın hesabatı" monthly value recap (money collected after reminders + unauthorized entries blocked + trend) and tighten collection follow-through (already-reminded tracking + escalating reminder tone), so a gym owner feels the flat $10/mo is obviously worth it.

**Architecture:** New read-models in `src/lib/recap.ts` and `src/lib/reminder-status.ts` compute everything from existing `Payment`, `AuditLog` (`reminder.sent` rows), `CheckIn`, and `VisitorPass` data — **no schema changes**. A new owner-only `/recap` server page renders the recap with the `.dash` design. The reminders page/queue gain an "already reminded" signal and pick a firmer WhatsApp template once a debt is old. Denial-reason strings are extracted to a shared module so the recap filters on the same source the scanner writes.

**Tech Stack:** Next.js 16 App Router (RSC + server components), Prisma 6 → PostgreSQL, TypeScript, Tailwind v4 (`.dash` tokens), Vitest integration tests against `gympass_test`.

**Spec:** `docs/superpowers/specs/2026-06-14-monthly-recap-collection-design.md`

**Locked decisions:** recap is its own `/recap` page; reminder→paid attribution window = 14 days; firmer reminder tone at ≥14 days overdue; past-month paging capped at the last 12 months; free-rider entries shown as a **count** (never valued in ₼).

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/scan-reasons.ts` (create) | Single source of truth for denial-reason strings (moved out of scan-actions) so recap filters on the same constants the scanner writes |
| `src/lib/scan-actions.ts` (modify) | Import `REASON` from `scan-reasons` instead of defining it locally — no behavior change |
| `src/lib/recap.ts` (create) | `getMonthlyRecap` + `getRecapTrend` read-models (attribution + protection metrics) |
| `src/lib/reminder-status.ts` (create) | `remindedPaymentIds` — which payments already had a reminder sent |
| `src/lib/templates.ts` (modify) | `pickReminderTemplate(daysLate, override)` — firmer default tone for old debts |
| `src/app/recap/page.tsx` (create) | Owner-only recap page (server component, `.dash`) with month paging |
| `src/components/sidebar.tsx` (modify) | Add `/recap` nav item |
| `src/app/dashboard/page.tsx` (modify) | Add a labelled CTA link to `/recap` (no numbers) |
| `src/app/reminders/page.tsx` (modify) | Wire `alreadyReminded` into each `ReminderItem` |
| `src/components/reminder-queue.tsx` (modify) | Render "already reminded" badge; use escalating template |
| `src/locales/az.json`, `src/locales/ru.json` (modify) | `recap.*`, `nav.recap`, `reminders.alreadyReminded` keys |
| `src/lib/__tests__/recap.integration.test.ts` (create) | Tests for recap read-models |
| `src/lib/__tests__/reminder-status.integration.test.ts` (create) | Tests for `remindedPaymentIds` |
| `src/lib/__tests__/templates.integration.test.ts` (create) | Tests for `pickReminderTemplate` (pure; runs under the integration runner — the project's only configured runner) |

**Pre-req for all test steps:** the test DB must be up — `npm run db:up` (Docker `gympass-db`). Integration tests refuse to run unless `DATABASE_URL` points at `gympass_test` (enforced in `test/integration/helpers.ts`).

---

## Task 1: Extract denial reasons to a shared module

**Why:** `CheckIn.deniedReason` stores localized AZ strings (e.g. "Ödəniş gözlənilir"). The recap must count specific denial categories, so it has to match those exact strings. Sharing one constant prevents the recap from silently breaking if the wording changes.

**Files:**
- Create: `src/lib/scan-reasons.ts`
- Modify: `src/lib/scan-actions.ts:37-49` (remove the local `const REASON`, import it instead)

- [ ] **Step 1: Create the shared module**

Create `src/lib/scan-reasons.ts` with the exact strings currently in `scan-actions.ts`:

```ts
// Single source of truth for scanner denial-reason strings. These are written to
// CheckIn.deniedReason and also matched by the monthly recap, so both must read the
// same constants. (Strings are Azerbaijani; deniedReason is stored AZ-only by design.)
export const REASON: Record<string, string> = {
  format: "QR kodu yanlışdır",
  expired: "QR kodu vaxtı keçib — yenilənməsini gözləyin",
  invalid: "QR kodu etibarsızdır",
  wrong_gym: "Bu zalın üzvü deyil",
  not_found: "Üzv tapılmadı",
  FROZEN: "Üzvlük dondurulub",
  EXPIRED: "Üzvlük başa çatıb",
  CANCELLED: "Üzvlük ləğv edilib",
  PAYMENT: "Ödəniş gözlənilir",
  already_entered: "Bu gün artıq giriş edilib",
  limit_reached: "Aylıq giriş limiti dolub",
};

// Denials that represent protected revenue: someone who owed money or had no valid
// membership was kept out. FROZEN (a deliberate pause) and limit_reached (cap
// enforcement) are NOT revenue loss; already_entered is a separate sharing signal.
export const REVENUE_DENIAL_REASONS: readonly string[] = [
  REASON.PAYMENT,
  REASON.EXPIRED,
  REASON.CANCELLED,
];

// Reverse map: stored AZ string -> stable code, so UIs can localize the breakdown
// instead of printing the raw AZ string.
export const REASON_CODE: Record<string, string> = {
  [REASON.PAYMENT]: "payment",
  [REASON.EXPIRED]: "expired",
  [REASON.CANCELLED]: "cancelled",
  [REASON.already_entered]: "alreadyEntered",
};
```

- [ ] **Step 2: Point scan-actions at the shared module**

In `src/lib/scan-actions.ts`, delete the local `const REASON: Record<string, string> = { ... };` block (lines ~37-49) and add this import near the top with the other imports:

```ts
import { REASON } from "@/lib/scan-reasons";
```

Leave every `REASON.*` / `REASON[member.status]` usage unchanged.

- [ ] **Step 3: Verify nothing broke in the scanner path**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run test:e2e -- src/lib/__tests__/scan-actions.integration.test.ts`
Expected: PASS (denial strings are identical, so existing scanner tests still pass).

- [ ] **Step 4: Commit**

```bash
git add src/lib/scan-reasons.ts src/lib/scan-actions.ts
git commit -m "refactor(scan): extract denial REASON strings to shared scan-reasons module"
```

---

## Task 2: `getMonthlyRecap` read-model

**Files:**
- Create: `src/lib/recap.ts`
- Test: `src/lib/__tests__/recap.integration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/recap.integration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getMonthlyRecap } from "@/lib/recap";
import { REASON } from "@/lib/scan-reasons";
import {
  prisma,
  seedGym,
  seedMember,
  seedPayment,
} from "../../../test/integration/helpers";

const DAY = 24 * 60 * 60 * 1000;

// A fixed month with no DST/edge surprises: June 2026 (month index 5).
const Y = 2026;
const M = 5;
const inMonth = new Date(Date.UTC(Y, M, 10, 12, 0, 0)); // 2026-06-10

async function reminderSent(gymId: string, paymentId: string, at: Date) {
  await prisma.auditLog.create({
    data: {
      gymId,
      action: "reminder.sent",
      entityType: "Payment",
      entityId: paymentId,
      createdAt: at,
    },
  });
}

async function denied(gymId: string, memberId: string, reason: string, at: Date) {
  await prisma.checkIn.create({
    data: { gymId, memberId, result: "DENIED", deniedReason: reason, scannedAt: at },
  });
}

describe("recap — getMonthlyRecap", () => {
  it("counts a payment paid within 14 days after a reminder as reminder-collected", async () => {
    const gym = await seedGym();
    const member = await seedMember(gym.id);
    const paidAt = new Date(inMonth);
    const p = await seedPayment(gym.id, member.id, {
      status: "PAID",
      amount: "50",
      paidAt,
      dueDate: new Date(paidAt.getTime() - 20 * DAY),
    });
    await reminderSent(gym.id, p.id, new Date(paidAt.getTime() - 3 * DAY));

    const recap = await getMonthlyRecap(gym.id, Y, M);

    expect(recap.reminderCollected).toBe(50);
    expect(recap.totalRevenue).toBe(50);
  });

  it("excludes a payment whose reminder was more than 14 days before payment", async () => {
    const gym = await seedGym();
    const member = await seedMember(gym.id);
    const paidAt = new Date(inMonth);
    const p = await seedPayment(gym.id, member.id, {
      status: "PAID",
      amount: "50",
      paidAt,
      dueDate: new Date(paidAt.getTime() - 30 * DAY),
    });
    await reminderSent(gym.id, p.id, new Date(paidAt.getTime() - 20 * DAY));

    const recap = await getMonthlyRecap(gym.id, Y, M);

    expect(recap.reminderCollected).toBe(0); // outside window
    expect(recap.totalRevenue).toBe(50); // still real revenue
  });

  it("buckets denials: revenue denials counted, sharing signal separate, frozen ignored", async () => {
    const gym = await seedGym();
    const member = await seedMember(gym.id);
    await denied(gym.id, member.id, REASON.PAYMENT, inMonth);
    await denied(gym.id, member.id, REASON.EXPIRED, inMonth);
    await denied(gym.id, member.id, REASON.already_entered, inMonth);
    await denied(gym.id, member.id, REASON.FROZEN, inMonth);

    const recap = await getMonthlyRecap(gym.id, Y, M);

    expect(recap.blockedCount).toBe(2); // PAYMENT + EXPIRED
    expect(recap.sharingSignalCount).toBe(1); // already_entered
    const payment = recap.blockedByReason.find((b) => b.reason === REASON.PAYMENT);
    expect(payment?.count).toBe(1);
  });

  it("ignores events outside the requested month", async () => {
    const gym = await seedGym();
    const member = await seedMember(gym.id);
    const lastMonth = new Date(Date.UTC(Y, M - 1, 15));
    await seedPayment(gym.id, member.id, { status: "PAID", amount: "50", paidAt: lastMonth, dueDate: lastMonth });
    await denied(gym.id, member.id, REASON.PAYMENT, lastMonth);

    const recap = await getMonthlyRecap(gym.id, Y, M);

    expect(recap.totalRevenue).toBe(0);
    expect(recap.blockedCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:e2e -- src/lib/__tests__/recap.integration.test.ts`
Expected: FAIL — `Cannot find module '@/lib/recap'` (file doesn't exist yet).

- [ ] **Step 3: Implement `getMonthlyRecap`**

Create `src/lib/recap.ts`:

```ts
import "server-only";
import { forGym } from "@/lib/tenant";
import { toCents, centsToNumber } from "@/lib/money";
import { REASON, REVENUE_DENIAL_REASONS } from "@/lib/scan-reasons";

// Locked: a payment counts as "collected after a reminder" only if a reminder was
// sent before payment and no more than 14 days before it.
const REMINDER_ATTRIBUTION_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export type BlockedReasonCount = { reason: string; count: number };

export type MonthlyRecap = {
  year: number;
  month: number; // 0-indexed (JS Date convention)
  reminderCollected: number; // AZN — paid this month within 14d after a reminder
  totalRevenue: number; // AZN — all collected this month (ratio denominator only)
  blockedCount: number; // revenue denials (owed money / invalid membership)
  blockedByReason: BlockedReasonCount[]; // reason = stored AZ string
  sharingSignalCount: number; // already_entered denials (ambiguous)
};

export async function getMonthlyRecap(
  gymId: string,
  year: number,
  month: number
): Promise<MonthlyRecap> {
  const db = forGym(gymId);
  const monthStart = new Date(Date.UTC(year, month, 1));
  const nextMonthStart = new Date(Date.UTC(year, month + 1, 1));

  const [paidThisMonth, visitorPasses, denials] = await Promise.all([
    db.payment.findMany({
      where: { status: "PAID", paidAt: { gte: monthStart, lt: nextMonthStart } },
      select: { id: true, amount: true, paidAt: true },
    }),
    db.visitorPass.findMany({
      where: { createdAt: { gte: monthStart, lt: nextMonthStart } },
      select: { amount: true },
    }),
    db.checkIn.findMany({
      where: { result: "DENIED", scannedAt: { gte: monthStart, lt: nextMonthStart } },
      select: { deniedReason: true },
    }),
  ]);

  // Total collected this month (member payments + visitor passes). Denominator only —
  // the Panel owns the headline revenue number; here it's just the ratio base.
  let totalCents = 0;
  for (const p of paidThisMonth) totalCents += toCents(p.amount);
  for (const v of visitorPasses) totalCents += toCents(v.amount);

  // Reminder-attributed revenue: earliest reminder per payment, within the window.
  let reminderCents = 0;
  const paidIds = paidThisMonth.map((p) => p.id);
  if (paidIds.length > 0) {
    const reminders = await db.auditLog.findMany({
      where: { action: "reminder.sent", entityType: "Payment", entityId: { in: paidIds } },
      select: { entityId: true, createdAt: true },
    });
    const firstReminder = new Map<string, Date>();
    for (const r of reminders) {
      const prev = firstReminder.get(r.entityId);
      if (!prev || r.createdAt < prev) firstReminder.set(r.entityId, r.createdAt);
    }
    for (const p of paidThisMonth) {
      if (!p.paidAt) continue;
      const rem = firstReminder.get(p.id);
      if (!rem) continue;
      const delta = p.paidAt.getTime() - rem.getTime();
      if (delta >= 0 && delta <= REMINDER_ATTRIBUTION_WINDOW_MS) {
        reminderCents += toCents(p.amount);
      }
    }
  }

  // Denials → blocked (revenue protection) vs sharing signal vs ignored.
  let blockedCount = 0;
  let sharingSignalCount = 0;
  const byReason = new Map<string, number>();
  for (const d of denials) {
    const reason = d.deniedReason ?? "";
    if (REVENUE_DENIAL_REASONS.includes(reason)) {
      blockedCount += 1;
      byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    } else if (reason === REASON.already_entered) {
      sharingSignalCount += 1;
    }
  }

  return {
    year,
    month,
    reminderCollected: centsToNumber(reminderCents),
    totalRevenue: centsToNumber(totalCents),
    blockedCount,
    blockedByReason: [...byReason.entries()].map(([reason, count]) => ({ reason, count })),
    sharingSignalCount,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:e2e -- src/lib/__tests__/recap.integration.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/recap.ts src/lib/__tests__/recap.integration.test.ts
git commit -m "feat(recap): getMonthlyRecap read-model (reminder-attributed revenue + blocked entries)"
```

---

## Task 3: `getRecapTrend` (6-month attribution trend)

**Files:**
- Modify: `src/lib/recap.ts` (append)
- Test: `src/lib/__tests__/recap.integration.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/recap.integration.test.ts`:

```ts
import { getRecapTrend } from "@/lib/recap";

describe("recap — getRecapTrend", () => {
  it("returns one point per month, oldest first, ending on the requested month", async () => {
    const gym = await seedGym();
    const member = await seedMember(gym.id);
    // A payment paid in the requested month, reminded 2 days before.
    const paidAt = new Date(Date.UTC(2026, 5, 10));
    const p = await seedPayment(gym.id, member.id, {
      status: "PAID", amount: "50", paidAt, dueDate: new Date(paidAt.getTime() - 10 * DAY),
    });
    await reminderSent(gym.id, p.id, new Date(paidAt.getTime() - 2 * DAY));

    const trend = await getRecapTrend(gym.id, 2026, 5, 6);

    expect(trend).toHaveLength(6);
    expect(trend[0]).toMatchObject({ year: 2026, month: 0 }); // Jan 2026 (5 months back)
    expect(trend[5]).toMatchObject({ year: 2026, month: 5 }); // requested month last
    expect(trend[5].reminderCollected).toBe(50);
    expect(trend[0].reminderCollected).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:e2e -- src/lib/__tests__/recap.integration.test.ts -t "getRecapTrend"`
Expected: FAIL — `getRecapTrend is not a function`.

- [ ] **Step 3: Implement `getRecapTrend`**

Append to `src/lib/recap.ts`:

```ts
export type RecapTrendPoint = {
  year: number;
  month: number; // 0-indexed
  reminderCollected: number; // AZN
  blockedCount: number;
};

// Per-month series of the two attribution metrics, oldest first, ending on (year,month).
// Distinct from the dashboard's total-revenue chart — different series entirely.
export async function getRecapTrend(
  gymId: string,
  year: number,
  month: number,
  months = 6
): Promise<RecapTrendPoint[]> {
  const points: RecapTrendPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - i, 1));
    const r = await getMonthlyRecap(gymId, d.getUTCFullYear(), d.getUTCMonth());
    points.push({
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
      reminderCollected: r.reminderCollected,
      blockedCount: r.blockedCount,
    });
  }
  return points;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:e2e -- src/lib/__tests__/recap.integration.test.ts`
Expected: PASS (all recap tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/recap.ts src/lib/__tests__/recap.integration.test.ts
git commit -m "feat(recap): getRecapTrend 6-month attribution series"
```

---

## Task 4: `remindedPaymentIds` (collection follow-through data)

**Files:**
- Create: `src/lib/reminder-status.ts`
- Test: `src/lib/__tests__/reminder-status.integration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/reminder-status.integration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { remindedPaymentIds } from "@/lib/reminder-status";
import { prisma, seedGym, seedMember, seedPayment } from "../../../test/integration/helpers";

describe("reminder-status — remindedPaymentIds", () => {
  it("returns the set of payment ids that already had a reminder sent", async () => {
    const gym = await seedGym();
    const member = await seedMember(gym.id);
    const reminded = await seedPayment(gym.id, member.id, { status: "PENDING" });
    const notReminded = await seedPayment(gym.id, member.id, {
      status: "PENDING",
      period: "2026-07",
      dueDate: new Date("2026-07-01"),
    });
    await prisma.auditLog.create({
      data: {
        gymId: gym.id,
        action: "reminder.sent",
        entityType: "Payment",
        entityId: reminded.id,
      },
    });

    const ids = await remindedPaymentIds(gym.id, [reminded.id, notReminded.id]);

    expect(ids.has(reminded.id)).toBe(true);
    expect(ids.has(notReminded.id)).toBe(false);
  });

  it("returns an empty set when given no ids", async () => {
    const gym = await seedGym();
    const ids = await remindedPaymentIds(gym.id, []);
    expect(ids.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:e2e -- src/lib/__tests__/reminder-status.integration.test.ts`
Expected: FAIL — `Cannot find module '@/lib/reminder-status'`.

- [ ] **Step 3: Implement `remindedPaymentIds`**

Create `src/lib/reminder-status.ts`:

```ts
import "server-only";
import { forGym } from "@/lib/tenant";

// Which of the given payments already had a "reminder.sent" audit row written.
// Used by the reminders queue to flag "already reminded · still unpaid" so nothing slips.
export async function remindedPaymentIds(
  gymId: string,
  paymentIds: string[]
): Promise<Set<string>> {
  if (paymentIds.length === 0) return new Set();
  const db = forGym(gymId);
  const rows = await db.auditLog.findMany({
    where: { action: "reminder.sent", entityType: "Payment", entityId: { in: paymentIds } },
    select: { entityId: true },
  });
  return new Set(rows.map((r) => r.entityId));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:e2e -- src/lib/__tests__/reminder-status.integration.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/reminder-status.ts src/lib/__tests__/reminder-status.integration.test.ts
git commit -m "feat(reminders): remindedPaymentIds helper for already-reminded tracking"
```

---

## Task 5: Escalating reminder tone

**Files:**
- Modify: `src/lib/templates.ts` (append a const + function)
- Test: `src/lib/__tests__/templates.integration.test.ts` (create — pure unit test, runs under the integration runner since that's the only configured runner)

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/templates.integration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickReminderTemplate, DEFAULT_TEMPLATES } from "@/lib/templates";

describe("templates — pickReminderTemplate", () => {
  it("uses the gym override whenever one is set, regardless of age", () => {
    expect(pickReminderTemplate(2, "Custom {memberName}")).toBe("Custom {memberName}");
    expect(pickReminderTemplate(40, "Custom {memberName}")).toBe("Custom {memberName}");
  });

  it("uses the gentle default for recent debt (<14 days)", () => {
    expect(pickReminderTemplate(5, null)).toBe(DEFAULT_TEMPLATES.reminder);
    expect(pickReminderTemplate(5, "")).toBe(DEFAULT_TEMPLATES.reminder);
  });

  it("uses the firmer default once debt is 14+ days old", () => {
    const firm = pickReminderTemplate(14, null);
    expect(firm).not.toBe(DEFAULT_TEMPLATES.reminder);
    expect(firm).toContain("{amount}");
    expect(firm).toContain("{memberName}");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:e2e -- src/lib/__tests__/templates.integration.test.ts`
Expected: FAIL — `pickReminderTemplate is not exported`.

- [ ] **Step 3: Implement the escalation helper**

Append to `src/lib/templates.ts`:

```ts
// Firmer default reminder, used when a debt is old. A gym's custom template always
// wins over this — escalation only varies GymPass's built-in default wording.
const REMINDER_FIRM_DEFAULT =
  "Salam {memberName}! {gymName} üzvlüyünüzün {period} dövrü üçün ödəniş ({amount}) hələ də qeydə alınmayıb və müddət xeyli keçib. Zəhmət olmasa ödənişi təcili həll edək.";

const FIRM_TONE_THRESHOLD_DAYS = 14;

export function pickReminderTemplate(
  daysLate: number,
  gymOverride: string | null | undefined
): string {
  if (gymOverride && gymOverride.trim().length > 0) return gymOverride;
  return daysLate >= FIRM_TONE_THRESHOLD_DAYS
    ? REMINDER_FIRM_DEFAULT
    : DEFAULT_TEMPLATES.reminder;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:e2e -- src/lib/__tests__/templates.integration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/templates.ts src/lib/__tests__/templates.integration.test.ts
git commit -m "feat(reminders): escalating default reminder tone for old debts"
```

---

## Task 6: i18n keys (recap, nav, reminders badge)

**Files:**
- Modify: `src/locales/az.json`
- Modify: `src/locales/ru.json`

- [ ] **Step 1: Add the `recap` block + keys to `az.json`**

Add a `"recap"` block (place it near the other page blocks, e.g. after `"reminders"`), and add `"recap"` to the existing `"nav"` block, and `"alreadyReminded"` to the existing `"reminders"` block:

```json
"recap": {
  "title": "Ayın hesabatı",
  "subtitle": "GymPass bu ay sənə nə qazandırdı",
  "reminderCollected": "Xatırlatmadan sonra yığılan",
  "ofTotal": "{total}₼ ödənişin {amount}₼-i",
  "blocked": "İcazəsiz giriş bloklandı",
  "blockedEntries": "{count} giriş",
  "sharingSignal": "Eyni gün təkrar cəhd",
  "trendTitle": "Son 6 ay",
  "reasonPayment": "Borc",
  "reasonExpired": "Üzvlük bitib",
  "reasonCancelled": "Ləğv edilib",
  "prevMonth": "Əvvəlki ay",
  "nextMonth": "Növbəti ay",
  "empty": "Bu ay üçün məlumat yoxdur",
  "ctaFromDashboard": "GymPass bu ay sənə nə qazandırdı? →"
}
```

In the `"nav"` block add:

```json
"recap": "Ayın hesabatı",
```

In the `"reminders"` block add:

```json
"alreadyReminded": "Xatırladıldı",
```

- [ ] **Step 2: Add the same keys (Russian) to `ru.json`**

```json
"recap": {
  "title": "Итоги месяца",
  "subtitle": "Что GymPass принёс вам в этом месяце",
  "reminderCollected": "Собрано после напоминания",
  "ofTotal": "{amount}₼ из {total}₼",
  "blocked": "Заблокировано входов без оплаты",
  "blockedEntries": "{count} входов",
  "sharingSignal": "Повторная попытка в тот же день",
  "trendTitle": "Последние 6 месяцев",
  "reasonPayment": "Долг",
  "reasonExpired": "Членство истекло",
  "reasonCancelled": "Отменено",
  "prevMonth": "Предыдущий месяц",
  "nextMonth": "Следующий месяц",
  "empty": "Нет данных за этот месяц",
  "ctaFromDashboard": "Что GymPass принёс вам в этом месяце? →"
}
```

In `"nav"`: `"recap": "Итоги месяца",`
In `"reminders"`: `"alreadyReminded": "Напомнили",`

- [ ] **Step 3: Validate JSON and key parity**

Run:
```bash
node -e "const az=require('./src/locales/az.json'),ru=require('./src/locales/ru.json');const f=(o,p='')=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==='object'&&!('one'in v&&'other'in v)?f(v,p+k+'.'):[p+k]);const a=new Set(f(az)),r=new Set(f(ru));const oa=[...a].filter(k=>!r.has(k)),or=[...r].filter(k=>!a.has(k));console.log('az',a.size,'ru',r.size);if(oa.length)console.log('ONLY AZ',oa);if(or.length)console.log('ONLY RU',or);if(!oa.length&&!or.length)console.log('IN SYNC')"
```
Expected: `IN SYNC` and equal counts.

- [ ] **Step 4: Commit**

```bash
git add src/locales/az.json src/locales/ru.json
git commit -m "i18n(recap): recap page, nav, and already-reminded keys (az + ru)"
```

---

## Task 7: Recap page + nav item

**Files:**
- Create: `src/app/recap/page.tsx`
- Modify: `src/components/sidebar.tsx` (add nav item)

- [ ] **Step 1: Add the nav item**

In `src/components/sidebar.tsx`, add `Sparkles` to the existing `lucide-react` import, and add this entry to the `ITEMS` array immediately after the `/reminders` entry:

```ts
{ href: "/recap", labelKey: "nav.recap", icon: Sparkles, ownerOnly: true },
```

- [ ] **Step 2: Create the recap page**

Create `src/app/recap/page.tsx`:

```tsx
import Link from "next/link";
import { Sparkles, ShieldCheck, MessageCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { requireOwner } from "@/lib/dal";
import { getT } from "@/lib/i18n-server";
import { getMonthlyRecap, getRecapTrend } from "@/lib/recap";
import { REASON_CODE } from "@/lib/scan-reasons";

const AZ_MONTHS = ["Yanvar","Fevral","Mart","Aprel","May","İyun","İyul","Avqust","Sentyabr","Oktyabr","Noyabr","Dekabr"];

// Parse ?ym=YYYY-MM (1-indexed month) into a 0-indexed {year, month}; default = current.
function parseYm(ym: string | undefined): { year: number; month: number } {
  const now = new Date();
  if (ym) {
    const m = /^(\d{4})-(\d{2})$/.exec(ym);
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]) - 1;
      if (month >= 0 && month <= 11) return { year, month };
    }
  }
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() };
}

function ymString(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export default async function RecapPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const user = await requireOwner(); // owner-only route
  const t = await getT();
  const { ym } = await searchParams;
  const { year, month } = parseYm(ym);

  const [recap, trend] = await Promise.all([
    getMonthlyRecap(user.gymId, year, month),
    getRecapTrend(user.gymId, year, month, 6),
  ]);

  // Month paging, capped to the last 12 months and not beyond the current month.
  const now = new Date();
  const curIdx = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const viewIdx = year * 12 + month;
  const prev = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month + 1, 1));
  const canPrev = curIdx - (viewIdx - 1) <= 11; // don't page past 12 months back
  const canNext = viewIdx < curIdx;

  const maxTrend = Math.max(1, ...trend.map((p) => p.reminderCollected));

  return (
    <AppShell>
      <PageHeader title={t("recap.title")} subtitle={t("recap.subtitle")} icon={Sparkles} tone="dark" />
      <div className="dash min-h-full px-4 lg:px-7 py-6" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Month pager */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          {canPrev ? (
            <Link href={`/recap?ym=${ymString(prev.getUTCFullYear(), prev.getUTCMonth())}`} className="md-edit-btn">
              <ChevronLeft className="w-4 h-4" /> {t("recap.prevMonth")}
            </Link>
          ) : <span />}
          <span style={{ fontSize: 15, fontWeight: 800, color: "var(--d-tx)" }}>
            {AZ_MONTHS[month]} {year}
          </span>
          {canNext ? (
            <Link href={`/recap?ym=${ymString(next.getUTCFullYear(), next.getUTCMonth())}`} className="md-edit-btn">
              {t("recap.nextMonth")} <ChevronRight className="w-4 h-4" />
            </Link>
          ) : <span />}
        </div>

        {/* Two hero stats — the numbers nothing else shows */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ background: "white", borderRadius: 16, boxShadow: "var(--d-sh1)", padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(16,185,129,.12)", color: "#10b981", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <MessageCircle className="w-3.5 h-3.5" />
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--d-tx3)" }}>{t("recap.reminderCollected")}</span>
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-1px", color: "var(--d-tx)" }}>
              {recap.reminderCollected.toFixed(2)} ₼
            </div>
            <div style={{ fontSize: 11.5, color: "var(--d-tx3)", marginTop: 4 }}>
              {t("recap.ofTotal", { amount: recap.reminderCollected.toFixed(2), total: recap.totalRevenue.toFixed(2) })}
            </div>
          </div>

          <div style={{ background: "white", borderRadius: 16, boxShadow: "var(--d-sh1)", padding: "20px 22px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(59,123,246,.12)", color: "#3b7bf6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--d-tx3)" }}>{t("recap.blocked")}</span>
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-1px", color: "var(--d-tx)" }}>
              {recap.blockedCount}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--d-tx3)", marginTop: 4 }}>
              {recap.blockedByReason.map((b) => {
                const code = REASON_CODE[b.reason];
                const label = code ? t(`recap.reason${code.charAt(0).toUpperCase() + code.slice(1)}`) : b.reason;
                return `${label}: ${b.count}`;
              }).join(" · ") || (recap.sharingSignalCount > 0 ? `${t("recap.sharingSignal")}: ${recap.sharingSignalCount}` : "—")}
            </div>
          </div>
        </div>

        {/* 6-month trend of reminder-collected (distinct from the Panel's revenue chart) */}
        <div style={{ background: "white", borderRadius: 16, boxShadow: "var(--d-sh1)", padding: "20px 22px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--d-tx)", marginBottom: 14 }}>{t("recap.trendTitle")}</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 120 }}>
            {trend.map((p) => (
              <div key={`${p.year}-${p.month}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ width: "100%", display: "flex", alignItems: "flex-end", height: 90 }}>
                  <div style={{ width: "100%", borderRadius: "6px 6px 0 0", background: "#3b7bf6", height: `${Math.round((p.reminderCollected / maxTrend) * 100)}%`, minHeight: p.reminderCollected > 0 ? 4 : 0 }} />
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--d-tx3)" }}>{AZ_MONTHS[p.month].slice(0, 3)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 3: Typecheck, lint, build**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run lint -- src/app/recap/page.tsx src/components/sidebar.tsx`
Expected: clean.

Run: `npm run build`
Expected: compiles; `/recap` appears in the route list.

- [ ] **Step 4: Runtime smoke test**

Follow the saved smoke-test recipe (mint an owner session JWT, curl with the `gympass_session` cookie). Confirm:
```
/recap -> 200
```
and the HTML contains `recap.title`'s rendered value and the `dash min-h-full` wrapper, with no error boundary. Use an owner session whose gym has data (a gym with members/payments), per the recipe.

- [ ] **Step 5: Commit**

```bash
git add src/app/recap/page.tsx src/components/sidebar.tsx
git commit -m "feat(recap): owner-only /recap page with month pager, hero stats, and 6-month trend"
```

---

## Task 8: Dashboard CTA link to /recap

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Add the CTA link**

In `src/app/dashboard/page.tsx`, ensure `Link` from `next/link` is imported (it already is). Inside the dashboard's `.dash` content wrapper, near the top (right after the wrapper's opening tag), add a labelled CTA that renders **no numbers** (entry point only):

```tsx
<Link
  href="/recap"
  className="md-edit-btn"
  style={{ alignSelf: "flex-start" }}
>
  {t("recap.ctaFromDashboard")}
</Link>
```

If the dashboard content wrapper is not a flex column, place the link in an existing row or wrap it in a `<div style={{ marginBottom: 8 }}>` instead — the only requirement is that it renders as a visible link to `/recap` with no recap numbers duplicated.

- [ ] **Step 2: Typecheck + lint**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run lint -- src/app/dashboard/page.tsx`
Expected: clean.

- [ ] **Step 3: Runtime smoke test**

Per the recipe, curl `/dashboard` with an owner session. Confirm it still returns `200` and the HTML contains an `href="/recap"`.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(dashboard): CTA link to the monthly recap (no duplicated numbers)"
```

---

## Task 9: Reminders — already-reminded badge + escalating tone

> **Spec note — debt aging already exists.** The spec's "debt aging per member"
> (days-overdue display + oldest-first ordering) is already implemented: the current
> `reminders/page.tsx` orders unpaid payments `dueDate: "asc"` (oldest first) and each
> item carries `daysLate`, which the queue renders via `t("units.days", …)`. This task
> therefore only adds the two genuinely new pieces: the **already-reminded** signal and
> the **escalating tone**.

**Files:**
- Modify: `src/app/reminders/page.tsx`
- Modify: `src/components/reminder-queue.tsx`

- [ ] **Step 1: Wire `alreadyReminded` into the page**

In `src/app/reminders/page.tsx`:

1. Add the import:
```ts
import { remindedPaymentIds } from "@/lib/reminder-status";
```

2. After `paymentItems` is built (the array of overdue/dueNow items, each with a `paymentId`), compute the reminded set and stamp each item. Add this just before the final `items` array is assembled:
```ts
const paymentIdList = paymentItems
  .map((i) => i.paymentId)
  .filter((id): id is string => Boolean(id));
const reminded = await remindedPaymentIds(user.gymId, paymentIdList);
for (const item of paymentItems) {
  item.alreadyReminded = item.paymentId ? reminded.has(item.paymentId) : false;
}
```

- [ ] **Step 2: Add the field to the `ReminderItem` type and render the badge + escalating tone**

In `src/components/reminder-queue.tsx`:

1. Add `alreadyReminded?: boolean;` to the `ReminderItem` type.

2. Replace the reminder-template selection in `buildWa` so non-expiring messages escalate by age. Change the import:
```ts
import { buildWaUrl, pickReminderTemplate, pickTemplate, renderTemplate } from "@/lib/templates";
```
and in `buildWa`, for the non-expiring branch, replace `const tmpl = pickTemplate("reminder", reminderTemplate);` with:
```ts
const tmpl = pickReminderTemplate(item.daysLate ?? 0, reminderTemplate);
```

3. In the member row, render a small "already reminded" badge when `item.alreadyReminded` is true. Next to the existing group badge, add:
```tsx
{item.alreadyReminded && (
  <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: "var(--d-bg)", color: "var(--d-tx3)", whiteSpace: "nowrap", flexShrink: 0 }}>
    {t("reminders.alreadyReminded")}
  </span>
)}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run lint -- src/app/reminders/page.tsx src/components/reminder-queue.tsx`
Expected: clean.

- [ ] **Step 4: Runtime smoke test**

Per the recipe, curl `/reminders` with an owner session whose gym has overdue payments where one has a `reminder.sent` audit row. Confirm `200`, no error boundary, and the rendered `reminders.alreadyReminded` label appears for the reminded member. (Seed a `reminder.sent` audit row via the vite-node seed approach if needed.)

- [ ] **Step 5: Commit**

```bash
git add src/app/reminders/page.tsx src/components/reminder-queue.tsx
git commit -m "feat(reminders): already-reminded badge + escalating tone for old debts"
```

---

## Final verification

- [ ] **Full test suite:** `npm run test:e2e` → all integration tests pass.
- [ ] **Typecheck:** `npm run typecheck` → clean.
- [ ] **Lint:** `npm run lint` → clean.
- [ ] **Build:** `npm run build` → compiles, `/recap` in the route list.
- [ ] **Locale parity:** the Task-6 parity script prints `IN SYNC`.
- [ ] **Dedup check (manual):** confirm the recap page shows none of the Panel's headline numbers (total revenue appears only as the ratio denominator; no active-count / new-members / churn), per the spec's "one home per metric" rule.

---

## Notes / known limitations (documented, not bugs)

- `CheckIn.deniedReason` is stored as an Azerbaijani string. The recap localizes the
  *breakdown labels* via `REASON_CODE` → i18n, but any denial reason not in `REASON_CODE`
  would fall back to the raw stored string. The headline counts are language-independent.
- `getRecapTrend` runs `getMonthlyRecap` once per month (6 sequential queries). Fine at
  this scale; if it ever matters, batch into a single grouped query later.
