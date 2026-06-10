import { headers } from "next/headers";
import { Trash2 } from "lucide-react";
import { getOwnerDb } from "@/lib/dal";
import { getT } from "@/lib/i18n-server";
import { revokeScannerDevice } from "@/lib/scanner-device-actions";
import { PairDeviceDialog } from "@/components/pair-device-dialog";

function fmtDateTime(d: Date | null): string {
  if (!d) return "—";
  return d.toISOString().replace("T", " ").slice(0, 16);
}

export async function ScannerDevicesCard() {
  const { db } = await getOwnerDb();
  const t = await getT();
  const devices = await db.scannerDevice.findMany({
    where: { revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      lastSeenAt: true,
      tokenHash: true,
      createdAt: true,
    },
  });

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--muted)]">{t("settings.devicesHint")}</p>

      {devices.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{t("settings.devicesNoDevices")}</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {devices.map((d) => (
            <li key={d.id} className="py-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{d.name}</div>
                <div className="text-[11px] text-[var(--muted)]">
                  {d.tokenHash
                    ? t("settings.devicesLastSeen", { date: fmtDateTime(d.lastSeenAt) })
                    : t("settings.devicesPending")}
                </div>
              </div>
              <form
                action={async () => {
                  "use server";
                  await revokeScannerDevice(d.id);
                }}
              >
                <button
                  className="text-red-600 hover:text-red-700 inline-flex items-center gap-1 text-sm"
                  aria-label={t("common.delete")}
                >
                  <Trash2 className="w-3.5 h-3.5" /> {t("common.delete")}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <PairDeviceDialog origin={origin} />
    </div>
  );
}
