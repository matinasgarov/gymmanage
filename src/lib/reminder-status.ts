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
