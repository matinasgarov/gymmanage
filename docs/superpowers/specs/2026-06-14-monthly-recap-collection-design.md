# Design: "Ayın hesabatı" Monthly Recap + Collection Follow-through

Date: 2026-06-14
Status: Draft for review
Sub-project 1 of the **Revenue Protection** value bet (makes GymPass feel worth $10/mo).

---

## Purpose

GymPass is priced at a flat **$10/month**. An owner must feel, every month, that the
app is obviously worth paying for. The surest way to produce that feeling is to put a
**manat number in front of the owner that dwarfs $10** — money the app collected,
chased, or blocked.

This sub-project delivers two tightly-linked features:

1. **"Ayın hesabatı" (Your month in numbers)** — a single screen that quantifies, in
   AZN, what GymPass did for the gym this month. The recurring reminder of value.
2. **Collection follow-through** — sharpening the existing collect loop so reminded-
   but-unpaid members don't slip, which *generates* the money the recap brags about.

### Success criteria

- At any time, the owner can open "Ayın hesabatı" for the current or a past month and
  see a one-screen, honest, AZN-denominated summary of GymPass's value that month.
- Every number is **computed from events GymPass already records** — no inflated or
  unverifiable figures.
- The collection view makes it impossible to "forget" a member who was reminded and
  still hasn't paid.
- **No schema changes** are required for v1 (everything is computable from existing
  `Payment`, `AuditLog`, `CheckIn`, `Member`, `VisitorPass` rows).

### Non-goals (explicitly out of scope for this sub-project)

- Cash-truth / staff reconciliation (separate sub-project, needs a new model).
- Win-back automation, lead-conversion polish (Tier 3).
- Class booking, member app, workout plans, waivers, staff scheduling (wrong market).
- Persisting/emailing the recap, or push notifications (future; v1 computes live).
- Any paywall/gating mechanic — the product is flat $10, there is no free tier.

---

## Separation of concerns — one home per metric

Hard rule for this work: **no number is shown as a headline on more than one surface.**
A surface may *link* to where a number lives, but it must not re-render the same figure
as its own primary stat. The three surfaces own disjoint jobs:

| Surface | Owns (its home metrics) | Tense / job |
|---|---|---|
| **Panel** (`/dashboard`) | Active members, today's check-ins (granted), month revenue total + 12-mo revenue chart + revenue-by-plan, churn, **alert counts** (overdue, expiring, new leads, at-risk) shown as *links to action* | **Now** — operational cockpit, drives action |
| **Reminders** (`/reminders`) | The collection workspace: overdue / due-now / expiring **queue detail**, collect-today total, debt aging, reminded-but-unpaid | **Now** — the place you *do* collection |
| **Recap** (`/recap`) | **Only attribution/protection**: money collected *after a reminder*, unauthorized entries *blocked*, possible-sharing signals, and the month-over-month trend of those | **Past** — value scorecard, makes $10 feel worth it |

Consequences this spec follows:
- The recap does **not** re-show total revenue, new-member count, active count, or
  churn — those are the Panel's. (Total revenue appears on the recap *only* as the small
  denominator of the "collected after a reminder" ratio, not as a stat of its own.)
- The Panel's overdue/collect-today widgets stay **summaries that link** into the
  Reminders workspace (their detailed home) — they don't gain duplicated queue detail.
- The recap's check-in numbers are strictly the **denied/blocked** ones; the Panel's are
  strictly the **granted** ones. No overlap.

---

## Part A — "Ayın hesabatı" monthly recap

### Where it lives

A new route `/recap` (nav label "Ayın hesabatı"), owner-only. A month selector lets the
owner page back to previous months. The dashboard gets a small **CTA link** to it
("GymPass bu ay sənə nə qazandırdı? →") — a labelled entry point only, **not** a card
that re-renders the recap's numbers (that would duplicate them per the rule above).

### The lines — recap shows ONLY what nothing else shows

To avoid showing the owner the same numbers two or three times (see *Separation of
concerns* above), the recap is built **exclusively from attribution/protection metrics
that the Panel and Reminders pages structurally cannot compute.** Raw state that
already lives on the Panel (total revenue, active members, new members, churn) is **not
re-rendered here**. The one shared figure that does appear — total revenue — appears
*only as a denominator* for the attribution ratio, never as its own headline number.

| Line | Unique to recap? | Source query | Honesty guardrail |
|---|---|---|---|
| **Xatırlatmadan sonra yığılan** (collected after a reminder) — the headline | ✅ Yes — requires `reminder.sent` → `paidAt` attribution no other page does | Payments `PAID` this month where a `reminder.sent` `AuditLog` row exists for that payment id with `createdAt` **before** `paidAt`, within a **14-day** window | Conservative: reminder must precede payment, within 14 days |
| **…of total {X}₼ collected** (ratio context) | Denominator only | Month revenue (reuse dashboard math) | Shown small, as the base of the ratio — NOT a standalone revenue card (that's the Panel's job) |
| **İcazəsiz giriş bloklandı** (unauthorized entries blocked) — the second headline | ✅ Yes — Panel counts *granted* check-ins; nothing surfaces *denied* as protection | `CheckIn` `result=DENIED` this month where `deniedReason` ∈ {`PAYMENT`, `EXPIRED`, `CANCELLED`, `OVERDUE`}; shown as a **count**, optionally broken down by reason. Excludes `FROZEN` (paused) and `limit_reached` (cap enforcement). | Count only, never valued in ₼ |
| **Təkrar/eyni gün cəhd** (possible-sharing signals) | ✅ Yes | `CheckIn` `result=DENIED` with `deniedReason = already_entered`. Count, shown smaller. | Ambiguous (double-tap vs sharing) — soft secondary signal, never headline |
| **6- aylıq trend** (these two metrics over time) | ✅ Yes — Panel's chart is *total revenue*; this trends the *attribution* metrics | Per-month series of reminder-collected ₼ and blocked-entry count | Distinct from the Panel's revenue chart — different series entirely |

**Headline composition:** "Bu ay GymPass: **{reminderCollected}₼ yığdı** · **{blockedCount}
giriş bloklandı**" — the two unique attribution numbers lead. The total-revenue
denominator sits under the first as small text ("320₼ ödənişin {x}₼-i"). New members,
churn, active count, and the revenue total/chart stay on the Panel and are **not**
repeated here.

### Decisions locked (previously open)

- **Free-rider valuation:** count only in the headline; no ₼ estimate that could feel
  inflated. (We can add an estimated-value sub-line later if owners ask for it.)
- **Reminder→paid attribution window:** 14 days (fits monthly memberships).

### Implementation shape

- New `src/lib/recap.ts` exporting `getMonthlyRecap(gymId, year, month)` — a read-model
  that runs the queries above against `forGym(gymId)` and returns a typed `MonthlyRecap`.
  Mirror the patterns in `src/lib/dashboard.ts` (integer-cents math, UTC month
  boundaries, `Promise.all` batching).
- New `src/app/recap/page.tsx` (server component, `.dash` design) rendering the recap
  cards + month selector. Reuse the existing PageHeader / card visual system.
- Dashboard CTA: a labelled link in `src/app/dashboard/page.tsx` to `/recap` (no
  numbers rendered on it — entry point only).
- i18n keys under a new `recap.*` block in `az.json` + `ru.json` (kept in sync).

---

## Part B — Collection follow-through

The reminders page already shows a 3-group queue (overdue / due-now / expiring) and a
"collect today" total, and `recordReminderSent` already writes a `reminder.sent` audit
row per payment. This part closes the loop so reminded members don't slip.

### Additions

1. **Debt aging per member.** In the overdue group, show how many days each payment is
   past due (computed from `dueDate` vs today — already available) and sort oldest-first
   so the most at-risk money is on top.
2. **Reminded-but-unpaid tracking.** Mark rows where a `reminder.sent` row already
   exists for that payment but it's still unpaid ("xatırladıldı · hələ ödənilməyib · N
   gün əvvəl"). This is the "don't let it slip" signal. Computed by joining the queue
   payments against their `reminder.sent` audit rows — no schema change.
3. **Escalating tone by age.** When building the WhatsApp message, pick a softer vs
   firmer template variant based on days overdue (e.g. ≤ grace = gentle nudge, > 14 days
   = firm). v1 selects among existing/templated copy client-side; no new model. (If the
   gym has a custom `waReminderTemplate`, that still wins — escalation only varies the
   built-in default tone.)

### Implementation shape

- Extend the reminder queue server query (`src/app/reminders/page.tsx`) to also pull the
  set of payment ids that already have a `reminder.sent` audit row, and pass an
  `alreadyReminded` + `daysOverdue` field into each `ReminderItem`.
- Extend `src/components/reminder-queue.tsx` to render the aging + "already reminded"
  badge and order overdue oldest-first.
- Escalation tier helper in `src/lib/templates.ts` (or alongside `pickTemplate`).

---

## Data flow summary

```
Existing events                     Read-models (new/extended)        UI
───────────────                     ──────────────────────────        ──
Payment.paidAt / amount  ─┐
AuditLog "reminder.sent" ─┼──────►  getMonthlyRecap()        ───────►  /recap page
CheckIn DENIED (+reason) ─┤                                            dashboard teaser
Member created/cancelled ─┘
VisitorPass.amount       ─┘

Payment (overdue) ───────┐
AuditLog "reminder.sent" ─┼──────►  reminder queue (extended) ──────►  /reminders page
                                    + daysOverdue + alreadyReminded
```

No new tables, columns, or migrations. All additive.

---

## Testing

- Unit-test `getMonthlyRecap` with seeded fixtures covering: a payment paid after a
  reminder inside the window (counts), paid before the reminder (excluded), paid 20 days
  after the reminder (excluded), denied check-ins of each reason category (correct
  bucketing), month-boundary edges (UTC).
- Unit-test the reminder-aging / already-reminded derivation.
- Runtime smoke test per the saved recipe (minted owner session + curl) confirming
  `/recap` renders with seeded data and matches hand-computed totals (assert on
  interpolated AZN strings, not bare i18n keys).

---

## Open questions for reviewer

1. Recap route name — `/recap` + nav "Ayın hesabatı" OK, or prefer it folded into the
   dashboard rather than its own page?
2. Should past-month recap paging be unlimited, or capped (e.g. last 12 months)?
