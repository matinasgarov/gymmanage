import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { PlanType } from "@/generated/prisma/enums";

const PLAN_DAYS: Record<PlanType, number> = {
  MONTHLY: 30,
  QUARTERLY: 90,
  ANNUAL: 365,
};

export function addPlanDays(start: Date, plan: PlanType): Date {
  const d = new Date(start);
  d.setUTCDate(d.getUTCDate() + PLAN_DAYS[plan]);
  return d;
}

export async function nextPublicId(gymId: string): Promise<string> {
  const last = await prisma.member.findFirst({
    where: { gymId },
    orderBy: { createdAt: "desc" },
    select: { publicId: true },
  });
  const lastNum = last?.publicId ? parseInt(last.publicId.replace(/\D/g, ""), 10) : 0;
  const next = (Number.isFinite(lastNum) ? lastNum : 0) + 1;
  return `M-${String(next).padStart(5, "0")}`;
}

export function newQrSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

// Re-exported from the money module so there is one money implementation.
export { formatAZN } from "@/lib/money";
