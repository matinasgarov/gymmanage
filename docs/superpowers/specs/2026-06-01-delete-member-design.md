# Delete Member — Design

**Date:** 2026-06-01
**Status:** Approved (brainstorming) → ready for implementation plan

## Problem

Owners need a way to permanently remove a member — for test entries, duplicates,
mistaken signups, or erasure requests. The app currently only has a **Cancel**
flow (sets `status = CANCELLED`, keeps all history, reversible via "reactivate").
There is no way to actually delete the record.

## Scope & decisions

- **Hard delete (permanent).** Removes the `Member` row and cascade-deletes its
  related `Payment`, `CheckIn`, and `Freeze` rows. Irreversible.
- **Owner-only.** Gated through `getOwnerDb()` like every other member action;
  STAFF cannot delete.
- **Type-to-confirm.** A dialog requires typing the member's exact name before
  the delete button enables. The server **re-validates** the typed name — the
  guard is not merely client-side.
- **Audit survives.** A `member.delete` audit row is written inside the same
  transaction, before the delete. `AuditLog` references the member by string id
  (no foreign key), so it is not cascaded away.
- **Available in any status** — an active or cancelled member can both be deleted.

Out of scope: deleting the uploaded photo file from `/public/uploads` (the row
is removed; the orphaned file is left in place), bulk delete, soft-delete/archive
state, undo.

## Architecture

Three units, all following existing patterns in the codebase:

1. **`deleteMember` server action** in `src/lib/member-actions.ts` — mirrors the
   existing `cancelMember`.
2. **`DeleteMemberDialog` client component** in
   `src/components/delete-member-dialog.tsx` — mirrors the existing
   `CancelDialog`.
3. **Placement + audit label** — a danger-zone button on the member detail page
   and one new entry in `AUDIT_ACTION_LABEL`.

### 1. Server action — `deleteMember(memberId, formData)`

```
export async function deleteMember(memberId: string, formData: FormData)
```

- `const { user, db } = await getOwnerDb();` (owner-gate; redirects STAFF).
- Read `confirmName` from `formData`; `const typed = String(formData.get("confirmName") ?? "").trim();`
- `const member = await db.member.findFirst({ where: { id: memberId } });`
  - If `!member` → `return;` (nothing to delete).
  - If `typed !== member.name` → `return;` (confirmation failed; no delete).
- Transaction, in this order:
  1. `tx.auditLog.create({ data: { gymId: user.gymId, actorId: user.id,
     action: "member.delete", entityType: "Member", entityId: memberId,
     payload: { publicId, name, phone, planType, status } } })` — snapshot,
     since the row is about to vanish.
  2. `tx.member.delete({ where: { id: memberId } })` — Prisma cascades to
     `Payment`, `CheckIn`, `Freeze` (all `onDelete: Cascade` in schema).
- `revalidatePath("/members");`
- `redirect("/members");` — the detail page no longer exists.

Note on tenant scoping: `forGym` (used by `getOwnerDb`) injects `gymId` into the
`where` of `findFirst` and `delete`, so a member from another gym can neither be
read nor deleted here.

### 2. Dialog — `DeleteMemberDialog`

Client component (`"use client"`), props `{ memberId: string; memberName: string }`.
Mirrors `src/components/cancel-dialog.tsx`:

- Trigger: a red **"Üzvü sil"** button with a trash icon.
- Modal body: warning that the action is **permanent and irreversible** and
  erases all payments, check-ins, and freezes; instruction to type the member's
  exact name to confirm.
- A controlled text input. The submit button **"Həmişəlik sil"** is disabled
  until `typed.trim() === memberName.trim()`.
- Submit posts a `<form action={deleteMember.bind(null, memberId)}>` with a
  hidden/controlled `confirmName` field carrying the typed value.
- A "Ləğv et" (close) button dismisses the modal without acting.

### 3. Placement + audit label

- `src/app/members/[id]/page.tsx`: in the bottom action row (currently holds
  `CancelDialog` / reactivate at ~line 267), add `<DeleteMemberDialog
  memberId={member.id} memberName={member.name} />` set apart as a danger zone
  (e.g. pushed right with `ml-auto`, or below a subtle divider) so it reads as
  distinct from the routine cancel/reactivate control. Import the component at
  the top.
- `src/lib/audit.ts`: add `"member.delete": "Üzv silindi",` to
  `AUDIT_ACTION_LABEL`. `entityHref` is left unchanged — a deleted-member audit
  row will link to a now-404 `/members/<id>`; acceptable and not worth special
  casing.

## Data flow

```
Member detail page → DeleteMemberDialog (type name) → submit
  → deleteMember(memberId, { confirmName })
      → owner gate → re-fetch member → verify typed === name
      → tx: write audit snapshot, then delete member (cascade payments/checkins/freezes)
      → revalidate /members → redirect /members
```

## Error handling & edge cases

- **Wrong name typed:** server returns without deleting (defense in depth behind
  the client-side disable).
- **Member already gone / not in this gym:** `findFirst` returns null → no-op.
- **STAFF user:** `getOwnerDb()` redirects to `/dashboard`; never reaches delete.
- **Orphaned photo file:** intentionally left in `/public/uploads`; out of scope.
- **Audit link to deleted member:** the audit page row will 404 if clicked;
  accepted.

## Testing / verification

This project has no test runner (only `lint` + `typecheck`). Verify with
`npm run typecheck`, `npm run lint` on touched files, and manual checks:

1. As OWNER, open a member, click "Üzvü sil", type the wrong name → delete button
   stays disabled.
2. Type the exact name → button enables → confirm → redirected to `/members`,
   member gone from the list.
3. Re-open `/members` and the audit log → a "Üzv silindi" entry exists with the
   member's snapshot.
4. Confirm the member's payments/check-ins are gone (no orphan rows referencing
   the deleted id).
5. As STAFF, the detail page is not reachable (owner-gated); the action cannot be
   invoked.
6. `npm run typecheck` clean.

## Files

- `src/lib/member-actions.ts` (modify — add `deleteMember`)
- `src/components/delete-member-dialog.tsx` (new)
- `src/app/members/[id]/page.tsx` (modify — import + place button)
- `src/lib/audit.ts` (modify — add label)

## Reusable patterns to copy

- Server action shape (owner gate, re-fetch, transaction, audit, revalidate) →
  `cancelMember` in `src/lib/member-actions.ts`.
- Modal dialog with a server-action form → `src/components/cancel-dialog.tsx`.
- Bottom action row placement → existing block in `src/app/members/[id]/page.tsx`.
