import "server-only";
import { redirect } from "next/navigation";
import { readSession } from "@/lib/session";
import { readDevice, type DevicePayload } from "@/lib/device";
import { prisma } from "@/lib/prisma";
import { forGym, type GymDb } from "@/lib/tenant";

export type Actor =
  | { kind: "user"; user: { id: string; gymId: string; role: "OWNER" | "STAFF" }; device: null }
  | { kind: "device"; user: null; device: DevicePayload };

// Returns a gym-scoped client plus the acting principal. Prefer the user session;
// fall back to the paired-device cookie. Redirect to /login if neither is present.
export async function getActorDb(): Promise<{ actor: Actor; db: GymDb }> {
  const session = await readSession();
  if (session?.userId) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, gymId: true, role: true },
    });
    if (user?.gymId) {
      return {
        actor: { kind: "user", user, device: null },
        db: forGym(user.gymId),
      };
    }
  }

  const device = await readDevice();
  if (device) {
    return {
      actor: { kind: "device", user: null, device },
      db: forGym(device.gymId),
    };
  }

  return redirect("/login");
}

export function actorLabel(row: {
  scannedBy?: { name: string } | null;
  scannerDevice?: { name: string } | null;
}): string {
  if (row.scannedBy) return row.scannedBy.name;
  if (row.scannerDevice) return row.scannerDevice.name;
  return "Sistem";
}
