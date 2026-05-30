import { redirect } from "next/navigation";
import { Smartphone } from "lucide-react";
import { redeemPairing } from "@/lib/scanner-device-actions";
import { RedeemPairingForm } from "@/components/redeem-pairing-form";

export const dynamic = "force-dynamic";

export default async function DoorPairCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const result = await redeemPairing(code);
  if (result.ok) {
    redirect("/door");
  }

  return (
    <main className="min-h-screen bg-[var(--background)] flex items-center justify-center px-4 py-10">
      <div className="card w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-[var(--brand-strong)]" />
          <h1 className="font-medium">Qoşulma uğursuz oldu</h1>
        </div>
        <p className="text-sm text-red-600">{result.message}</p>
        <p className="text-sm text-[var(--muted)]">
          Aşağıda kodu yenidən daxil edə bilərsiniz:
        </p>
        <RedeemPairingForm initialCode={code} />
      </div>
    </main>
  );
}
