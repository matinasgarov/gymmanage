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
      select: { id: true, name: true, phone: true, publicId: true, photoUrl: true, startDate: true },
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
    const { startDate, ...info } = m;
    const seen = lastSeen.get(m.id);
    if (!seen) {
      // Never entered. Only at risk once they've been a member longer than the
      // threshold — measure the grace window from their start date so a member
      // who just joined isn't flagged before they've had a chance to come.
      if (startDate < ghosterCutoff) {
        ghosters.push({ ...info, daysSince: null });
      }
    } else if (seen < ghosterCutoff) {
      ghosters.push({ ...info, daysSince: daysBetween(seen, now) });
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
