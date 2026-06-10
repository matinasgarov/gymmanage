"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import { Scanner } from "@/components/scanner";
import { DoorManualLookup } from "@/components/door-manual-lookup";
import { useT } from "@/components/i18n-provider";
import type { ScanResult } from "@/lib/scan-actions";

export function DoorPanel({
  gymName,
  deviceName,
  todayCount,
}: {
  gymName: string;
  deviceName: string;
  todayCount: number;
}) {
  const t = useT();
  const [manualResult, setManualResult] = useState<ScanResult | null>(null);

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{gymName}</div>
          <div className="text-[11px] text-[var(--muted)]">{deviceName}</div>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <Activity className="w-4 h-4 text-[var(--brand-strong)]" />
          <span className="font-semibold">{todayCount}</span>
          <span className="text-[var(--muted)]">{t("door.todayLabel")}</span>
        </div>
      </header>

      <div className="flex-1 p-4 space-y-4">
        <Scanner canOverride={false} />
        <DoorManualLookup onResult={setManualResult} />
        {manualResult && (
          <div
            className={`card p-4 text-sm ${
              manualResult.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
            }`}
          >
            {manualResult.ok
              ? t("door.grantedResult", { name: manualResult.member.name })
              : t("door.deniedResult", { reason: manualResult.reason })}
          </div>
        )}
      </div>
    </main>
  );
}
