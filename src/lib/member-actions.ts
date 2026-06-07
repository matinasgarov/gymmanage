"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOwnerDb } from "@/lib/dal";
import { memberSchema } from "@/lib/validators";
import { addPlanDays, nextPublicId, newQrSecret } from "@/lib/members";
import { periodKey } from "@/lib/payments";
import { planMaxEntries } from "@/config/gym-plans";

export type MemberFormState =
  | { errors?: Record<string, string[]>; message?: string }
  | undefined;

export async function createMember(
  _prev: MemberFormState,
  formData: FormData
): Promise<MemberFormState> {
  const { user, db } = await getOwnerDb();

  const parsed = memberSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    planType: formData.get("planType"),
    planPrice: formData.get("planPrice"),
    startDate: formData.get("startDate"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const data = parsed.data;
  const unlimitedEntries = formData.get("unlimitedEntries") === "true";
  // Per-cycle entry cap is dictated by the chosen plan (e.g. 12 for 12-entries).
  const monthlyEntryLimit = planMaxEntries(data.planType);
  const publicId = await nextPublicId(user.gymId);
  const expiryDate = addPlanDays(data.startDate, data.planType);
  const leadIdRaw = formData.get("leadId");
  const leadId =
    typeof leadIdRaw === "string" && leadIdRaw.length > 0 ? leadIdRaw : null;

  const member = await db.$transaction(async (tx) => {
    const m = await tx.member.create({
      data: {
        gymId: user.gymId,
        publicId,
        name: data.name,
        phone: data.phone,
        email: data.email,
        planType: data.planType,
        planPrice: data.planPrice,
        startDate: data.startDate,
        expiryDate,
        notes: data.notes,
        qrSecret: newQrSecret(),
        unlimitedEntries,
        monthlyEntryLimit,
      },
    });

    await tx.payment.create({
      data: {
        memberId: m.id,
        gymId: user.gymId,
        amount: data.planPrice,
        period: periodKey(data.startDate),
        dueDate: data.startDate,
        status: "PENDING",
      },
    });

    await tx.auditLog.create({
      data: {
        gymId: user.gymId,
        actorId: user.id,
        action: "member.create",
        entityType: "Member",
        entityId: m.id,
        payload: {
          publicId,
          name: data.name,
          planType: data.planType,
          planPrice: data.planPrice.toString(),
          ...(leadId ? { leadId } : {}),
        },
      },
    });

    if (leadId) {
      await tx.lead.updateMany({
        where: { id: leadId },
        data: {
          status: "CONVERTED",
          convertedAt: new Date(),
          convertedMemberId: m.id,
        },
      });
    }

    return m;
  });

  revalidatePath("/members");
  if (leadId) revalidatePath("/leads");
  redirect(`/members/${member.id}`);
}

export async function updateMember(
  memberId: string,
  _prev: MemberFormState,
  formData: FormData
): Promise<MemberFormState> {
  const { user, db } = await getOwnerDb();

  const parsed = memberSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    planType: formData.get("planType"),
    planPrice: formData.get("planPrice"),
    startDate: formData.get("startDate"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const unlimitedEntries = formData.get("unlimitedEntries") === "true";

  const existing = await db.member.findFirst({
    where: { id: memberId },
  });
  if (!existing) return { message: "Üzv tapılmadı" };

  const data = parsed.data;
  // Per-cycle entry cap follows the (possibly changed) plan.
  const monthlyEntryLimit = planMaxEntries(data.planType);
  const expiryDate = addPlanDays(data.startDate, data.planType);

  await db.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: memberId },
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email,
        planType: data.planType,
        planPrice: data.planPrice,
        startDate: data.startDate,
        expiryDate,
        notes: data.notes,
        unlimitedEntries,
        monthlyEntryLimit,
      },
    });

    await tx.auditLog.create({
      data: {
        gymId: user.gymId,
        actorId: user.id,
        action: "member.update",
        entityType: "Member",
        entityId: memberId,
        payload: {
          before: {
            name: existing.name,
            phone: existing.phone,
            planType: existing.planType,
            planPrice: existing.planPrice.toString(),
          },
          after: {
            name: data.name,
            phone: data.phone,
            planType: data.planType,
            planPrice: data.planPrice.toString(),
          },
        },
      },
    });
  });

  revalidatePath("/members");
  revalidatePath(`/members/${memberId}`);
  redirect(`/members/${memberId}`);
}

export async function freezeMember(memberId: string, formData: FormData) {
  const { user, db } = await getOwnerDb();
  const startDate = new Date(String(formData.get("startDate")));
  const endDate = new Date(String(formData.get("endDate")));
  const reason = String(formData.get("reason") ?? "") || null;

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return;
  if (endDate <= startDate) return;

  const member = await db.member.findFirst({
    where: { id: memberId },
  });
  if (!member) return;

  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const newExpiry = new Date(member.expiryDate);
  newExpiry.setUTCDate(newExpiry.getUTCDate() + days);

  await db.$transaction(async (tx) => {
    await tx.freeze.create({
      data: { memberId, startDate, endDate, reason },
    });
    await tx.member.update({
      where: { id: memberId },
      data: { status: "FROZEN", expiryDate: newExpiry },
    });
    await tx.auditLog.create({
      data: {
        gymId: user.gymId,
        actorId: user.id,
        action: "member.freeze",
        entityType: "Member",
        entityId: memberId,
        payload: { startDate, endDate, reason, days },
      },
    });
  });

  revalidatePath(`/members/${memberId}`);
}

const VALID_CANCEL_REASONS = [
  "MOVED",
  "PRICE",
  "INJURY",
  "LOST_MOTIVATION",
  "POOR_SERVICE",
  "OTHER",
] as const;
type CancelReasonValue = (typeof VALID_CANCEL_REASONS)[number];

function isCancelReason(v: unknown): v is CancelReasonValue {
  return typeof v === "string" && (VALID_CANCEL_REASONS as readonly string[]).includes(v);
}

export async function cancelMember(memberId: string, formData: FormData) {
  const { user, db } = await getOwnerDb();

  const reasonRaw = formData.get("reason");
  const reason = isCancelReason(reasonRaw) ? reasonRaw : "OTHER";
  const noteRaw = formData.get("note");
  const note =
    typeof noteRaw === "string" && noteRaw.trim().length > 0
      ? noteRaw.trim().slice(0, 500)
      : null;

  const member = await db.member.findFirst({
    where: { id: memberId },
  });
  if (!member) return;

  await db.$transaction(async (tx) => {
    await tx.member.update({
      where: { id: memberId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: reason,
        cancelNote: note,
      },
    });
    await tx.auditLog.create({
      data: {
        gymId: user.gymId,
        actorId: user.id,
        action: "member.cancel",
        entityType: "Member",
        entityId: memberId,
        payload: { reason, note },
      },
    });
  });

  revalidatePath("/members");
  revalidatePath(`/members/${memberId}`);
}

export async function deleteMember(memberId: string, formData: FormData) {
  const { user, db } = await getOwnerDb();

  const typed = String(formData.get("confirmName") ?? "").trim();

  const member = await db.member.findFirst({
    where: { id: memberId },
  });
  if (!member) return;
  // Defense in depth: the dialog disables submit until the name matches, but
  // re-verify here so the typed-name guard is not merely client-side.
  if (typed !== member.name) return;

  await db.$transaction(async (tx) => {
    // Snapshot the member BEFORE deleting — the row is about to vanish, and
    // AuditLog references members by string id (no FK), so it survives.
    await tx.auditLog.create({
      data: {
        gymId: user.gymId,
        actorId: user.id,
        action: "member.delete",
        entityType: "Member",
        entityId: memberId,
        payload: {
          publicId: member.publicId,
          name: member.name,
          phone: member.phone,
          planType: member.planType,
          status: member.status,
        },
      },
    });
    // Cascades to Payment, CheckIn, Freeze (all onDelete: Cascade in schema).
    await tx.member.delete({ where: { id: memberId } });
  });

  revalidatePath("/members");
  redirect("/members");
}

export async function reactivateMember(memberId: string) {
  const { user, db } = await getOwnerDb();
  await db.member.update({
    where: { id: memberId },
    data: {
      status: "ACTIVE",
      cancelledAt: null,
      cancelReason: null,
      cancelNote: null,
    },
  });
  await db.auditLog.create({
    data: {
      gymId: user.gymId,
      actorId: user.id,
      action: "member.reactivate",
      entityType: "Member",
      entityId: memberId,
    },
  });
  revalidatePath(`/members/${memberId}`);
}

