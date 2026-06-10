# Payment Collection Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop owners from chasing payments: grant grace-period entry with an amber debt warning at the door, nudge renewal on the member's pass page, and turn `/reminders` into a daily collection queue with a dashboard pill.

**Architecture:** One new pure function `computeDebt` in `src/lib/payments.ts` is the single source of truth for "what does this member owe right now". The scan actions, pass page, reminders page, and dashboard all consume it (or its underlying query shape). No schema changes; all sends remain owner-tapped WhatsApp deep links.

**Tech Stack:** Next.js 16 App Router + Server Actions, Prisma 6/PostgreSQL, Tailwind, vitest (`npm test` unit, `npm run test:e2e` integration — integration needs `npm run db:up` first).

**Spec:** `docs/superpowers/specs/2026-06-11-payment-collection-bundle-design.md`

**Conventions to follow:**
- Payment `amount` is a Prisma Decimal — convert with `Number(x.toString())` (UI) or `toCents` (dashboard aggregation).
- All user-facing strings go through i18n: add every new key to BOTH `src/locales/az.json` and `src/locales/ru.json` (az.json is the source-of-truth shape).
- Dates are handled in UTC with `setUTCDate` arithmetic, matching existing code.
- Tenant scoping: server actions/pages use the actor-scoped `db`; the pass page uses the unscoped `prisma` client guarded by `verifyPassUrlToken` (existing pattern).

---

### Task 1: `computeDebt` in payments.ts (pure, TDD) + de-dup the grace constant

**Files:**
- Modify: `src/lib/payments.ts`
- Modify: `src/app/reminders/page.tsx:8` (remove local `OVERDUE_GRACE_DAYS`)
- Modify: `src/lib/dashboard.ts:12` (remove local `OVERDUE_GRACE_DAYS`)
- Test: `src/lib/__tests__/payments.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/payments.test.ts` (add `computeDebt` and `OVERDUE_GRACE_DAYS` to the existing import from `@/lib/payments`):

```ts
describe("payments — computeDebt", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = new Date("2026-05-10T12:00:00Z");
  const pay = (daysAgo: number, amount = 50, paid = false) => ({
    status: paid ? "PAID" : "PENDING",
    dueDate: new Date(now.getTime() - daysAgo * day),
    paidAt: paid ? new Date(now.getTime() - daysAgo * day) : null,
    amount,
  });

  it("exports the 5-day grace constant", () => {
    expect(OVERDUE_GRACE_DAYS).toBe(5);
  });

  it("returns null when nothing is unpaid", () => {
    expect(computeDebt([], MONTHLY, "az", now)).toBeNull();
    expect(computeDebt([pay(2, 50, true)], MONTHLY, "az", now)).toBeNull();
  });

  it("is PENDING with grace days left within the 5-day window", () => {
    const d = computeDebt([pay(2)], MONTHLY, "az", now);
    expect(d?.effective).toBe("PENDING");
    expect(d?.graceDaysLeft).toBe(3);
    expect(d?.amount).toBe(50);
    expect(d?.periodLabel).toContain("2026");
  });

  it("is OVERDUE with zero grace once past the window", () => {
    const d = computeDebt([pay(6)], MONTHLY, "az", now);
    expect(d?.effective).toBe("OVERDUE");
    expect(d?.graceDaysLeft).toBe(0);
  });

  it("boundary: day 5 is still PENDING, day 6 is OVERDUE", () => {
    expect(computeDebt([pay(5)], MONTHLY, "az", now)?.effective).toBe("PENDING");
    expect(computeDebt([pay(6)], MONTHLY, "az", now)?.effective).toBe("OVERDUE");
  });

  it("sums multiple unpaid periods; any overdue period makes the whole debt OVERDUE", () => {
    const d = computeDebt([pay(40), pay(2)], MONTHLY, "az", now);
    expect(d?.amount).toBe(100);
    expect(d?.effective).toBe("OVERDUE");
  });

  it("ignores future-dated payments", () => {
    const future = {
      status: "PENDING",
      dueDate: new Date(now.getTime() + 5 * day),
      paidAt: null,
      amount: 50,
    };
    expect(computeDebt([future], MONTHLY, "az", now)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/__tests__/payments.test.ts`
Expected: FAIL — `computeDebt` / `OVERDUE_GRACE_DAYS` are not exported.

- [ ] **Step 3: Implement `computeDebt`**

In `src/lib/payments.ts`: change line 8 from `const OVERDUE_GRACE_DAYS = 5;` to `export const OVERDUE_GRACE_DAYS = 5;` and append:

```ts
// Single source of truth for "what does this member owe right now".
// Consumed by the door (scan-actions), the pass page, /reminders, and the dashboard.
export type DebtSummary = {
  amount: number; // AZN — sum of all unpaid payments due so far
  periodLabel: string; // label of the most recent unpaid period
  graceDaysLeft: number; // 0 when effective is OVERDUE
  effective: "PENDING" | "OVERDUE";
};

export function computeDebt(
  payments: { status: string; dueDate: Date; paidAt: Date | null; amount: number }[],
  plan: PlanType,
  locale: Locale = DEFAULT_LOCALE,
  now = new Date()
): DebtSummary | null {
  const graceEnd = (dueDate: Date) => {
    const d = new Date(dueDate);
    d.setUTCDate(d.getUTCDate() + OVERDUE_GRACE_DAYS);
    return d;
  };
  const unpaid = payments.filter(
    (p) =>
      p.status !== "PAID" &&
      p.paidAt === null &&
      p.dueDate.getTime() <= now.getTime()
  );
  if (unpaid.length === 0) return null;

  const latest = unpaid.reduce((a, b) => (a.dueDate > b.dueDate ? a : b));
  const overdue = unpaid.some((p) => now.getTime() > graceEnd(p.dueDate).getTime());
  const graceDaysLeft = Math.max(
    0,
    Math.ceil((graceEnd(latest.dueDate).getTime() - now.getTime()) / 86_400_000)
  );
  return {
    amount: unpaid.reduce((s, p) => s + p.amount, 0),
    periodLabel: formatPeriodLabel(latest.dueDate, plan, locale),
    graceDaysLeft,
    effective: overdue ? "OVERDUE" : "PENDING",
  };
}
```

(`PlanType`, `Locale`, `DEFAULT_LOCALE`, `formatPeriodLabel` are already imported/defined in this file.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/__tests__/payments.test.ts`
Expected: PASS (all, including the pre-existing ones).

- [ ] **Step 5: De-duplicate the grace constant**

- `src/app/reminders/page.tsx`: delete line 8 (`const OVERDUE_GRACE_DAYS = 5;`) and add `OVERDUE_GRACE_DAYS` to an import from `@/lib/payments`.
- `src/lib/dashboard.ts`: delete line 12 (`const OVERDUE_GRACE_DAYS = 5;`) and add `import { OVERDUE_GRACE_DAYS } from "@/lib/payments";`.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add src/lib/payments.ts src/lib/__tests__/payments.test.ts src/app/reminders/page.tsx src/lib/dashboard.ts
git commit -m "feat(payments): computeDebt summary + shared OVERDUE_GRACE_DAYS"
```

---

### Task 2: Grace entry at the door (scan-actions)

**Files:**
- Modify: `src/lib/scan-actions.ts`
- Test: `src/lib/__tests__/scan-actions.integration.test.ts`

Behavior change: an unpaid payment **within** the 5-day grace no longer denies entry — it grants with a `debt` payload. Past grace still denies (`REASON.PAYMENT`), unchanged.

- [ ] **Step 1: Write the failing integration tests**

Append to `src/lib/__tests__/scan-actions.integration.test.ts`:

```ts
describe("scan-actions — grace entry with debt", () => {
  it("grants with a debt payload when the current period is unpaid but within grace", async () => {
    const gym = await seedGym();
    const owner = await seedOwner(gym.id);
    // startDate 2 days ago → current period due 2 days ago: unpaid, within 5-day grace.
    const member = await seedMember(gym.id, { startDate: new Date(Date.now() - 2 * DAY) });
    await login(owner);
    const { token } = signScanToken(member.id, member.qrSecret);

    const res = await verifyScan(token);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.debt).toBeTruthy();
      expect(res.debt?.amount).toBeGreaterThan(0);
      expect(res.debt?.graceDaysLeft).toBeGreaterThan(0);
    }
    const granted = await prisma.checkIn.count({
      where: { memberId: member.id, result: "GRANTED" },
    });
    expect(granted).toBe(1);
  });

  it("carries no debt payload when the current period is paid", async () => {
    const { member } = await activeMember();
    const { token } = signScanToken(member.id, member.qrSecret);

    const res = await verifyScan(token);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.debt).toBeUndefined();
  });
});
```

Note: the existing test `"denies when the current period is unpaid/overdue"` (startDate 40 days ago) must keep passing — past-grace stays denied.

- [ ] **Step 2: Run integration tests to verify the new ones fail**

Run: `npm run db:up` (if not already running), then `npm run test:e2e -- src/lib/__tests__/scan-actions.integration.test.ts`
Expected: the two new tests FAIL (first one gets `ok: false` / "Ödəniş gözlənilir"; second fails on the missing `debt` property only at the type level — it may pass at runtime, that's fine). Everything else PASSES.

- [ ] **Step 3: Implement grace entry**

In `src/lib/scan-actions.ts`:

1. Extend the import from `@/lib/payments`:

```ts
import { ensurePendingPayments, computeDebt, type DebtSummary } from "@/lib/payments";
```

(`computeEffectiveStatus` and `periodsThrough` stay if still used — `periodsThrough` is used by `monthlyCapReached`; `computeEffectiveStatus` becomes unused and its import should be removed.)

2. Extend `ScanResult`'s `ok: true` branch:

```ts
export type ScanResult =
  | {
      ok: true;
      member: {
        id: string;
        name: string;
        publicId: string;
        photoUrl: string | null;
        status: string;
        expiryDate: string;
      };
      checkInId: string;
      debt?: { amount: number; periodLabel: string; graceDaysLeft: number };
    }
  | { /* ok: false branch unchanged */ };
```

3. Add a shared helper next to `monthlyCapReached`:

```ts
// Debt gate shared by verifyScan and grantManualEntry: ensures payment rows
// exist, then summarizes everything unpaid and due. OVERDUE → deny upstream;
// PENDING (within grace) → grant with the debt attached.
async function assessPaymentDebt(
  db: GymDb,
  member: { id: string; planType: PlanType }
): Promise<DebtSummary | null> {
  await ensurePendingPayments(member.id);
  const rows = await db.payment.findMany({
    where: {
      memberId: member.id,
      status: { not: "PAID" },
      paidAt: null,
      dueDate: { lte: new Date() },
    },
    select: { status: true, dueDate: true, paidAt: true, amount: true },
  });
  return computeDebt(
    rows.map((r) => ({ ...r, amount: Number(r.amount.toString()) })),
    member.planType
  );
}
```

4. In **`verifyScan`** replace the payment-check block (lines ~193–223: from `await ensurePendingPayments(...)` through the `if (currentPayment) {...}` deny) with:

```ts
  const debt = await assessPaymentDebt(db, member);
  if (debt && debt.effective === "OVERDUE") {
    await db.checkIn.create({
      data: {
        gymId,
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
      canOverride: canOverride(actor),
    };
  }
```

and extend the final granted return:

```ts
  return {
    ok: true,
    member: {
      ...memberInfo,
      status: member.status,
      expiryDate: member.expiryDate.toISOString().slice(0, 10),
    },
    checkInId: checkIn.id,
    ...(debt
      ? { debt: { amount: debt.amount, periodLabel: debt.periodLabel, graceDaysLeft: debt.graceDaysLeft } }
      : {}),
  };
```

5. Apply the **identical** replacement in `grantManualEntry` (its `ensurePendingPayments` + `currentPayment` block and its granted return).

- [ ] **Step 4: Run the full integration suite**

Run: `npm run test:e2e`
Expected: PASS, including the previously existing scan tests.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`
Expected: clean.

```bash
git add src/lib/scan-actions.ts src/lib/__tests__/scan-actions.integration.test.ts
git commit -m "feat(door): grant grace-period entry with debt payload, deny only past grace"
```

---

### Task 3: Amber result screen on the scanner

**Files:**
- Modify: `src/components/scanner.tsx` (ResultOverlay, ~lines 217–268)
- Modify: `src/locales/az.json` (`scan` section), `src/locales/ru.json` (`scan` section)

- [ ] **Step 1: Add i18n keys**

In `src/locales/az.json` inside `"scan"`:

```json
"debtLine": "Ödəniş gözlənilir: {amount}₼ · {period}",
"debtGrace": { "one": "{count} gün qalıb", "other": "{count} gün qalıb" }
```

In `src/locales/ru.json` inside `"scan"`:

```json
"debtLine": "Ожидается оплата: {amount}₼ · {period}",
"debtGrace": { "one": "остался {count} день", "few": "осталось {count} дня", "many": "осталось {count} дней", "other": "осталось {count} дня" }
```

- [ ] **Step 2: Render the amber state**

In `ResultOverlay` in `src/components/scanner.tsx`, replace:

```ts
  const granted = result.ok;
  const bg = granted ? "bg-green-600" : "bg-red-600";
```

with:

```ts
  const granted = result.ok;
  const debt = result.ok ? result.debt : undefined;
  const bg = !granted ? "bg-red-600" : debt ? "bg-amber-500" : "bg-green-600";
```

and inside the `result.ok ? (...)` branch, after the `publicId · expiry` line, add:

```tsx
          {debt && (
            <div className="mt-3 bg-white/25 rounded-md px-4 py-2 w-full max-w-xs">
              <div className="text-base font-semibold">
                {t("scan.debtLine", {
                  amount: debt.amount.toFixed(2),
                  period: debt.periodLabel,
                })}
              </div>
              <div className="text-sm opacity-90">
                {t("scan.debtGrace", { count: debt.graceDaysLeft })}
              </div>
            </div>
          )}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test`
Expected: clean / PASS (i18n test validates az/ru shape parity — must pass).

- [ ] **Step 4: Commit**

```bash
git add src/components/scanner.tsx src/locales/az.json src/locales/ru.json
git commit -m "feat(scanner): amber GRANTED screen with debt amount and grace countdown"
```

---

### Task 4: Renewal nudge on the pass page

**Files:**
- Modify: `src/app/pass/[memberId]/[token]/page.tsx`
- Modify: `src/locales/az.json` (`pass` section), `src/locales/ru.json` (`pass` section)

- [ ] **Step 1: Add i18n keys**

In `src/locales/az.json` inside `"pass"`:

```json
"debtBanner": "Ödəniş gözlənilir: {amount}₼ ({period})",
"expiresSoon": { "one": "Üzvlüyünüz {count} gün sonra bitir", "other": "Üzvlüyünüz {count} gün sonra bitir" },
"contactGym": "Zala yaz",
"renewMessage": "Salam! {gymName} üzvlüyümü yeniləmək istəyirəm ({publicId})."
```

In `src/locales/ru.json` inside `"pass"`:

```json
"debtBanner": "Ожидается оплата: {amount}₼ ({period})",
"expiresSoon": { "one": "Ваш абонемент истекает через {count} день", "few": "Ваш абонемент истекает через {count} дня", "many": "Ваш абонемент истекает через {count} дней", "other": "Ваш абонемент истекает через {count} дня" },
"contactGym": "Написать залу",
"renewMessage": "Здравствуйте! Хочу продлить абонемент {gymName} ({publicId})."
```

- [ ] **Step 2: Compute debt/expiry state in the page**

In `src/app/pass/[memberId]/[token]/page.tsx`:

1. Add imports:

```ts
import { ensurePendingPayments, computeDebt } from "@/lib/payments";
import { buildWaUrl } from "@/lib/templates";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n";
```

2. Extend the gym select: `gym: { select: { name: true, logoUrl: true, phone: true, locale: true } }`.

3. After the `verifyPassUrlToken` check, add:

```ts
  await ensurePendingPayments(member.id);
  const unpaidRows = await prisma.payment.findMany({
    where: {
      memberId: member.id,
      status: { not: "PAID" },
      paidAt: null,
      dueDate: { lte: new Date() },
    },
    select: { status: true, dueDate: true, paidAt: true, amount: true },
  });
  const gymLocale = isLocale(member.gym.locale) ? member.gym.locale : DEFAULT_LOCALE;
  const debt = computeDebt(
    unpaidRows.map((r) => ({ ...r, amount: Number(r.amount.toString()) })),
    member.planType,
    gymLocale
  );
  const daysToExpiry = Math.ceil((member.expiryDate.getTime() - Date.now()) / 86_400_000);
  const showExpirySoon = !debt && daysToExpiry >= 0 && daysToExpiry <= 7;
  const waUrl = member.gym.phone
    ? buildWaUrl(
        member.gym.phone,
        t("pass.renewMessage", { gymName: member.gym.name, publicId: member.publicId })
      )
    : null;
```

- [ ] **Step 3: Render the banner**

Between the `<header>` and the photo block, add:

```tsx
        {(debt || showExpirySoon) && (
          <div
            className={`rounded-lg px-4 py-3 text-sm border ${
              debt
                ? "bg-amber-50 text-amber-900 border-amber-200"
                : "bg-blue-50 text-blue-900 border-blue-200"
            }`}
          >
            <p className="font-medium">
              {debt
                ? t("pass.debtBanner", {
                    amount: debt.amount.toFixed(2),
                    period: debt.periodLabel,
                  })
                : t("pass.expiresSoon", { count: daysToExpiry })}
            </p>
            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center justify-center w-full rounded-full bg-emerald-500 hover:bg-emerald-600 text-white py-2 text-sm font-semibold"
              >
                {t("pass.contactGym")}
              </a>
            )}
          </div>
        )}
```

- [ ] **Step 4: Verify and commit**

Run: `npm run typecheck && npm test`
Expected: clean / PASS.

```bash
git add "src/app/pass/[memberId]/[token]/page.tsx" src/locales/az.json src/locales/ru.json
git commit -m "feat(pass): debt / expiring-soon banner with one-tap WhatsApp to the gym"
```

---

### Task 5: Morning collection queue (/reminders)

**Files:**
- Modify: `src/app/reminders/page.tsx`
- Modify: `src/components/reminder-queue.tsx`
- Modify: `src/locales/az.json` (`reminders` section), `src/locales/ru.json` (`reminders` section)

- [ ] **Step 1: Add i18n keys**

In `src/locales/az.json` inside `"reminders"`:

```json
"summaryTitle": "Bu gün yığılacaq",
"summaryValue": "{amount}₼ · {people} nəfər",
"group": { "overdue": "Borclu", "dueNow": "Ödəniş vaxtıdır", "expiring": "Üzvlük bitir" },
"statExpiry": "Bitmə",
"statDaysLeft": "Qalıb"
```

In `src/locales/ru.json` inside `"reminders"`:

```json
"summaryTitle": "Собрать сегодня",
"summaryValue": "{amount}₼ · {people} чел.",
"group": { "overdue": "Должник", "dueNow": "Срок оплаты", "expiring": "Абонемент истекает" },
"statExpiry": "Истекает",
"statDaysLeft": "Осталось"
```

- [ ] **Step 2: Update `ReminderItem` and the queue component**

In `src/components/reminder-queue.tsx`:

1. Replace the `ReminderItem` type:

```ts
export type ReminderItem = {
  group: "overdue" | "dueNow" | "expiring";
  // payment groups (overdue / dueNow)
  paymentId?: string;
  period?: string;
  amount?: number;
  daysLate?: number;
  // expiring group
  daysLeft?: number;
  expiryDate?: string;
  member: { id: string; name: string; phone: string; publicId: string };
};
```

2. Extend props and add the summary:

```ts
export function ReminderQueue({
  items,
  gymName,
  reminderTemplate,
  expiringTemplate,
  summary,
}: {
  items: ReminderItem[];
  gymName: string;
  reminderTemplate: string | null;
  expiringTemplate: string | null;
  summary: { amount: number; people: number };
}) {
```

3. Replace the `waUrl` memo:

```ts
  const waUrl = useMemo(() => {
    if (!current) return "";
    if (current.group === "expiring") {
      const tmpl = pickTemplate("expiring", expiringTemplate);
      const msg = renderTemplate(tmpl, {
        memberName: current.member.name,
        gymName,
        daysLeft: current.daysLeft ?? 0,
        expiryDate: current.expiryDate ?? "",
      });
      return buildWaUrl(current.member.phone, msg);
    }
    const tmpl = pickTemplate("reminder", reminderTemplate);
    const msg = renderTemplate(tmpl, {
      memberName: current.member.name,
      gymName,
      period: current.period ?? "",
      amount: `${(current.amount ?? 0).toFixed(2)}₼`,
    });
    return buildWaUrl(current.member.phone, msg);
  }, [current, gymName, reminderTemplate, expiringTemplate]);
```

4. Guard the audit recording (expiring items have no payment):

```ts
  const onSent = async () => {
    if (current.paymentId) void recordReminderSent(current.paymentId, "whatsapp");
    setSentCount((n) => n + 1);
    setIndex((i) => i + 1);
  };
  const onSkip = async () => {
    if (current.paymentId) void recordReminderSent(current.paymentId, "skip");
    setSkippedCount((n) => n + 1);
    setIndex((i) => i + 1);
  };
```

5. Add the summary header as the first child of the returned `<div className="max-w-md mx-auto space-y-4">` (render only when `summary.amount > 0`):

```tsx
      {summary.amount > 0 && (
        <div className="card px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-medium">{t("reminders.summaryTitle")}</span>
          <span className="text-sm font-semibold">
            {t("reminders.summaryValue", {
              amount: summary.amount.toFixed(2),
              people: summary.people,
            })}
          </span>
        </div>
      )}
```

6. Add a group chip inside the card, right above the avatar circle:

```tsx
        <span
          className={`inline-block text-[11px] px-2 py-0.5 rounded-full mb-3 ${
            current.group === "overdue"
              ? "bg-red-50 text-red-700"
              : current.group === "dueNow"
                ? "bg-amber-50 text-amber-700"
                : "bg-blue-50 text-blue-700"
          }`}
        >
          {t(`reminders.group.${current.group}`)}
        </span>
```

7. Make the stats row group-aware — replace the existing `grid grid-cols-3` block:

```tsx
        {current.group === "expiring" ? (
          <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
            <Stat label={t("reminders.statExpiry")} value={current.expiryDate ?? ""} />
            <Stat
              label={t("reminders.statDaysLeft")}
              value={t("units.days", { count: current.daysLeft ?? 0 })}
            />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 mt-4 text-sm">
            <Stat label={t("reminders.statPeriod")} value={current.period ?? ""} />
            <Stat
              label={t("reminders.statAmount")}
              value={`${(current.amount ?? 0).toFixed(2)}₼`}
            />
            <Stat
              label={t("reminders.statDelay")}
              value={t("units.days", { count: current.daysLate ?? 0 })}
            />
          </div>
        )}
```

- [ ] **Step 3: Rebuild the page query with three groups**

Replace the body of `src/app/reminders/page.tsx`'s data assembly (keep the page shell) with:

```ts
  const { user, db } = await getOwnerDb();
  const t = await getT();
  const now = new Date();
  const graceCutoff = new Date(now);
  graceCutoff.setUTCDate(graceCutoff.getUTCDate() - OVERDUE_GRACE_DAYS);
  const weekAhead = new Date(now);
  weekAhead.setUTCDate(weekAhead.getUTCDate() + 7);

  // Groups 1+2: every unpaid payment due so far (overdue AND within-grace).
  const unpaid = await db.payment.findMany({
    where: {
      status: { not: "PAID" },
      paidAt: null,
      dueDate: { lte: now },
      member: { status: { notIn: ["CANCELLED", "FROZEN"] } },
    },
    orderBy: { dueDate: "asc" },
    include: {
      member: { select: { id: true, name: true, phone: true, publicId: true } },
    },
    take: 200,
  });
  const withMember = unpaid.filter(
    (p): p is typeof p & { member: NonNullable<(typeof p)["member"]> } => p.member !== null
  );

  const paymentItems: ReminderItem[] = withMember.map((p) => {
    const daysLate = Math.floor((now.getTime() - p.dueDate.getTime()) / 86_400_000);
    return {
      group: daysLate > OVERDUE_GRACE_DAYS ? ("overdue" as const) : ("dueNow" as const),
      paymentId: p.id,
      period: p.period,
      amount: Number(p.amount.toString()),
      daysLate,
      member: p.member,
    };
  });

  // Group 3: expiring within 7 days with no open debt (debtors are in groups 1–2).
  const debtorIds = [...new Set(withMember.map((p) => p.member.id))];
  const expiring = await db.member.findMany({
    where: {
      status: "ACTIVE",
      expiryDate: { gte: now, lte: weekAhead },
      id: { notIn: debtorIds },
    },
    orderBy: { expiryDate: "asc" },
    select: { id: true, name: true, phone: true, publicId: true, expiryDate: true },
    take: 100,
  });
  const expiringItems: ReminderItem[] = expiring.map((m) => ({
    group: "expiring" as const,
    daysLeft: Math.max(0, Math.ceil((m.expiryDate.getTime() - now.getTime()) / 86_400_000)),
    expiryDate: m.expiryDate.toISOString().slice(0, 10),
    member: { id: m.id, name: m.name, phone: m.phone, publicId: m.publicId },
  }));

  const items: ReminderItem[] = [
    ...paymentItems.filter((i) => i.group === "overdue"),
    ...paymentItems.filter((i) => i.group === "dueNow"),
    ...expiringItems,
  ];
  const summary = {
    amount: paymentItems.reduce((s, i) => s + (i.amount ?? 0), 0),
    people: new Set(items.map((i) => i.member.id)).size,
  };
```

and pass the new props:

```tsx
        <ReminderQueue
          items={items}
          gymName={user.gym.name}
          reminderTemplate={user.gym.waReminderTemplate}
          expiringTemplate={user.gym.waExpiringTemplate}
          summary={summary}
        />
```

(`OVERDUE_GRACE_DAYS` is already imported from `@/lib/payments` since Task 1. Remove the now-unused `cutoff` constant.)

- [ ] **Step 4: Verify and commit**

Run: `npm run typecheck && npm test`
Expected: clean / PASS.

```bash
git add src/app/reminders/page.tsx src/components/reminder-queue.tsx src/locales/az.json src/locales/ru.json
git commit -m "feat(reminders): three-group collection queue with daily money summary"
```

---

### Task 6: Dashboard "collect today" pill

**Files:**
- Modify: `src/lib/dashboard.ts`
- Modify: `src/app/dashboard/page.tsx` (TIER 1 alerts block, ~lines 52–75)
- Modify: `src/locales/az.json` (`dashboard` section), `src/locales/ru.json` (`dashboard` section)

- [ ] **Step 1: Add i18n keys**

az.json `"dashboard"`:

```json
"collectPill": "{people} nəfərdən {amount}₼ yığılmalıdır"
```

ru.json `"dashboard"`:

```json
"collectPill": "Собрать {amount}₼ с {people} чел."
```

- [ ] **Step 2: Aggregate collectable money in `getDashboard`**

In `src/lib/dashboard.ts`, after the `visitorPasses` block, add:

```ts
  // Money the owner should collect right now: every unpaid payment already due
  // (both within-grace and overdue) for non-cancelled/frozen members.
  const collectRows = await db.payment.findMany({
    where: {
      status: { not: "PAID" },
      paidAt: null,
      dueDate: { lte: now },
      member: { status: { notIn: ["CANCELLED", "FROZEN"] } },
    },
    select: { amount: true, memberId: true },
  });
  let collectCents = 0;
  const collectMemberIds = new Set<string>();
  for (const r of collectRows) {
    collectCents += toCents(r.amount);
    if (r.memberId) collectMemberIds.add(r.memberId);
  }
```

and add to the returned object:

```ts
    collect: {
      amount: centsToNumber(collectCents),
      people: collectMemberIds.size,
    },
```

- [ ] **Step 3: Render the pill on the dashboard**

In `src/app/dashboard/page.tsx`, change the TIER 1 wrapper condition to:

```tsx
        {(data.newLeadsCount > 0 || atRiskCount > 0 || data.collect.people > 0) && (
```

and add as the **first** pill inside it (collections outrank leads):

```tsx
            {data.collect.people > 0 && (
              <Link
                href="/reminders"
                className="inline-flex items-center gap-2 rounded-full bg-amber-50 text-amber-700 px-3.5 py-1.5 text-sm font-medium transition-opacity hover:opacity-80"
              >
                <AlertTriangle className="w-4 h-4" />
                {t("dashboard.collectPill", {
                  amount: data.collect.amount.toFixed(2),
                  people: data.collect.people,
                })}
                <span aria-hidden>→</span>
              </Link>
            )}
```

(`AlertTriangle` is already imported in this file.)

- [ ] **Step 4: Verify and commit**

Run: `npm run typecheck && npm test`
Expected: clean / PASS.

```bash
git add src/lib/dashboard.ts src/app/dashboard/page.tsx src/locales/az.json src/locales/ru.json
git commit -m "feat(dashboard): collect-today pill linking to the reminder queue"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full automated suite**

Run: `npm run typecheck && npm run lint && npm test && npm run test:e2e`
Expected: all clean / PASS.

- [ ] **Step 2: Manual smoke test**

Run `npm run dev` and verify against seeded/dev data:

1. **Scanner**: member with PAID current period → green; member with PENDING payment within grace → amber with "Ödəniş gözlənilir: …₼ · … — N gün qalıb"; member unpaid past grace → red "Ödəniş gözlənilir" with owner override.
2. **Pass page**: same three members → no banner / amber debt banner with working "Zala yaz" WhatsApp link / (separately) an ACTIVE paid member with expiry ≤7 days shows the blue expiring banner.
3. **/reminders**: shows summary header with the correct sum, cards carry group chips in order overdue → dueNow → expiring; expiring card uses the expiring template; sending/skipping advances; audit rows written only for payment items.
4. **Dashboard**: amber pill appears with sum + people, links to `/reminders`; hidden when nothing is due.
5. Switch locale to ru in settings and spot-check the new strings.

- [ ] **Step 3: Report results**

Report any failures with output; do not claim success without the commands above passing.
