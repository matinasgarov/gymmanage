"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Smartphone } from "lucide-react";
import { redeemPairing } from "@/lib/scanner-device-actions";
import { RedeemPairingForm } from "@/components/redeem-pairing-form";

// Redeems the pairing code from a client component so the action runs in a
// Server Action context — the only place Next.js permits cookies().set().
// (Calling redeemPairing during the page's server render consumes the code but
// can't persist the device cookie, leaving the phone unpaired.)
export function AutoRedeem({ code }: { code: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    // Guard against React's dev double-invoke so we don't redeem twice.
    if (ran.current) return;
    ran.current = true;
    (async () => {
      const result = await redeemPairing(code);
      if (result.ok) {
        router.replace("/door");
      } else {
        setError(result.message);
      }
    })();
  }, [code, router]);

  return (
    <main className="min-h-screen bg-[var(--background)] flex items-center justify-center px-4 py-10">
      <div className="card w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-[var(--brand-strong)]" />
          <h1 className="font-medium">
            {error ? "Qoşulma uğursuz oldu" : "Qoşulur..."}
          </h1>
        </div>
        {error && (
          <>
            <p className="text-sm text-red-600">{error}</p>
            <p className="text-sm text-[var(--muted)]">
              Aşağıda kodu yenidən daxil edə bilərsiniz:
            </p>
            <RedeemPairingForm initialCode={code} />
          </>
        )}
      </div>
    </main>
  );
}
