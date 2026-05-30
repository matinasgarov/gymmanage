import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { readSession, type SessionPayload } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { forGym } from "@/lib/tenant";

export const verifySession = cache(async (): Promise<SessionPayload> => {
  const session = await readSession();
  if (!session?.userId) redirect("/login");
  return session;
});

export const getCurrentUser = cache(async () => {
  const session = await verifySession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      gymId: true,
      gym: {
        select: {
          id: true,
          name: true,
          ownerName: true,
          phone: true,
          address: true,
          logoUrl: true,
          locale: true,
          currency: true,
          waReminderTemplate: true,
          waReceiptTemplate: true,
          waExpiringTemplate: true,
          waWelcomeTemplate: true,
        },
      },
    },
  });
  if (!user || !user.gymId) redirect("/login");
  return user;
});

export async function requireOwner() {
  const user = await getCurrentUser();
  if (user.role !== "OWNER") redirect("/dashboard");
  return user;
}

// Gym-scoped Prisma client + current user. Use these for all authenticated,
// gym-scoped data access so tenant isolation is enforced automatically.
export async function getGymDb() {
  const user = await getCurrentUser();
  return { user, db: forGym(user.gymId) };
}

export async function getOwnerDb() {
  const user = await requireOwner();
  return { user, db: forGym(user.gymId) };
}
