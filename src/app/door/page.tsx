import { redirect } from "next/navigation";
import { DoorPanel } from "@/components/door-panel";
import { readDevice } from "@/lib/device";
import { forGym } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export default async function DoorPage() {
  const device = await readDevice();
  if (!device) redirect("/door/pair");

  const db = forGym(device.gymId);
  const todayStart = startOfDayUTC(new Date());

  const [todayCount, gym] = await Promise.all([
    db.checkIn.count({
      where: { result: "GRANTED", scannedAt: { gte: todayStart } },
    }),
    prisma.gym.findUnique({
      where: { id: device.gymId },
      select: { name: true },
    }),
  ]);

  return (
    <DoorPanel
      gymName={gym?.name ?? "Zal"}
      deviceName={device.name}
      todayCount={todayCount}
    />
  );
}
