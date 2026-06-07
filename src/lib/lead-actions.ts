"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOwnerDb } from "@/lib/dal";
import type { PlanType } from "@/generated/prisma/enums";
import { PLAN_TYPES } from "@/config/gym-plans";

// ─── Public action (no auth) ─────────────────────────────────────────

const leadSchema = z.object({
  gymId: z.string().min(1),
  name: z.string().min(2, "Ad ən az 2 simvol olmalıdır").trim(),
  phone: z
    .string()
    .regex(/^\+994\d{9}$/, "Telefon +994XXXXXXXXX formatında olmalıdır"),
  interest: z
    .union([z.enum(PLAN_TYPES as unknown as [PlanType, ...PlanType[]]), z.literal("")])
    .transform((v) => (v === "" ? null : v)),
  message: z
    .union([z.literal(""), z.string().max(500)])
    .transform((v) => (v === "" ? null : v)),
});

export type LeadFormState =
  | { ok?: true; errors?: Record<string, string[]>; message?: string }
  | undefined;

export async function submitLead(
  _prev: LeadFormState,
  formData: FormData
): Promise<LeadFormState> {
  const parsed = leadSchema.safeParse({
    gymId: formData.get("gymId"),
    name: formData.get("name"),
    phone: formData.get("phone"),
    interest: formData.get("interest") ?? "",
    message: formData.get("message") ?? "",
  });
  if (!parsed.success) {
    return { errors: z.flattenError(parsed.error).fieldErrors };
  }

  const { gymId, name, phone, interest, message } = parsed.data;

  const gym = await prisma.gym.findUnique({
    where: { id: gymId },
    select: { id: true },
  });
  if (!gym) return { message: "Zal tapılmadı" };

  // Naive rate limit: same phone+gym within 60s is treated as duplicate.
  const recent = await prisma.lead.findFirst({
    where: {
      gymId,
      phone,
      createdAt: { gt: new Date(Date.now() - 60 * 1000) },
    },
    select: { id: true },
  });
  if (recent) return { ok: true };

  await prisma.lead.create({
    data: {
      gymId,
      name,
      phone,
      interest,
      message,
      source: "self_signup",
    },
  });

  return { ok: true };
}

// ─── Owner actions ───────────────────────────────────────────────────

const VALID_STATUSES = ["NEW", "CONTACTED", "CONVERTED", "LOST"] as const;
type Status = (typeof VALID_STATUSES)[number];

function isStatus(v: unknown): v is Status {
  return typeof v === "string" && (VALID_STATUSES as readonly string[]).includes(v);
}

export async function setLeadStatus(leadId: string, status: string) {
  const { db } = await getOwnerDb();
  if (!isStatus(status)) return;
  if (status === "CONVERTED") return; // CONVERTED is set only via convert flow

  const lead = await db.lead.findFirst({
    where: { id: leadId },
    select: { id: true },
  });
  if (!lead) return;

  await db.lead.update({
    where: { id: lead.id },
    data: { status: status as Status },
  });
  revalidatePath("/leads");
}

export async function markLeadConverted(leadId: string, memberId: string) {
  const { db } = await getOwnerDb();
  await db.lead.updateMany({
    where: { id: leadId },
    data: {
      status: "CONVERTED",
      convertedAt: new Date(),
      convertedMemberId: memberId,
    },
  });
  revalidatePath("/leads");
}

export async function deleteLead(leadId: string) {
  const { db } = await getOwnerDb();
  await db.lead.deleteMany({
    where: { id: leadId },
  });
  revalidatePath("/leads");
}
