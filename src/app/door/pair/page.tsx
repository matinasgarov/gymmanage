import { Smartphone } from "lucide-react";
import { getT } from "@/lib/i18n-server";
import { RedeemPairingForm } from "@/components/redeem-pairing-form";

export const dynamic = "force-dynamic";

export default async function DoorPairPage() {
  const t = await getT();
  return (
    <main className="min-h-screen bg-[var(--background)] flex items-center justify-center px-4 py-10">
      <div className="card w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-[var(--brand-strong)]" />
          <h1 className="font-medium">{t("door.pairTitle")}</h1>
        </div>
        <p className="text-sm text-[var(--muted)]">{t("door.pairSubtitle")}</p>
        <RedeemPairingForm />
      </div>
    </main>
  );
}
