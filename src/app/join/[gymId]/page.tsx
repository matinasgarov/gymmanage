import { notFound } from "next/navigation";
import { Dumbbell } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/i18n-server";
import { JoinForm } from "./join-form";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ gymId: string }>;
}) {
  const { gymId } = await params;
  const [t, gym] = await Promise.all([
    getT(),
    prisma.gym.findUnique({
      where: { id: gymId },
      select: { id: true, name: true, logoUrl: true, phone: true, address: true },
    }),
  ]);
  if (!gym) notFound();

  return (
    <main className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-5">
          <div className="w-14 h-14 rounded-full bg-white shadow mx-auto flex items-center justify-center overflow-hidden">
            {gym.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={gym.logoUrl} alt={gym.name} className="w-full h-full object-cover" />
            ) : (
              <Dumbbell className="w-6 h-6 text-[var(--brand)]" />
            )}
          </div>
          <h1 className="text-xl font-semibold mt-3">{gym.name}</h1>
          <p className="text-sm text-neutral-600 mt-1">{t("join.subtitle")}</p>
        </div>

        <JoinForm gymId={gym.id} />

        <div className="text-center text-xs text-neutral-500 mt-4 space-y-0.5">
          {gym.phone && <div>Tel: {gym.phone}</div>}
          {gym.address && <div>{gym.address}</div>}
        </div>
      </div>
    </main>
  );
}
