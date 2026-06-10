"use client";

import { useState, useEffect, useTransition } from "react";
import { QRCodeSVG } from "qrcode.react";
import { X } from "lucide-react";
import {
  createScannerPairing,
  regeneratePairing,
  type PairingResult,
} from "@/lib/scanner-device-actions";
import { useT } from "@/components/i18n-provider";

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export function PairDeviceDialog({ origin }: { origin: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pairing, setPairing] = useState<
    { deviceId: string; code: string; expiresAt: number } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!pairing) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pairing]);

  function start() {
    setError(null);
    const fd = new FormData();
    fd.append("name", name);
    startTransition(async () => {
      const result = await createScannerPairing(undefined, fd);
      if (result.ok) {
        setPairing({
          deviceId: result.deviceId,
          code: result.pairingCode,
          expiresAt: new Date(result.expiresAt).getTime(),
        });
      } else {
        setError(result.message);
      }
    });
  }

  function regen() {
    if (!pairing) return;
    setError(null);
    startTransition(async () => {
      const result: PairingResult = await regeneratePairing(pairing.deviceId);
      if (result.ok) {
        setPairing({
          deviceId: result.deviceId,
          code: result.pairingCode,
          expiresAt: new Date(result.expiresAt).getTime(),
        });
      } else {
        setError(result.message);
      }
    });
  }

  function close() {
    setOpen(false);
    setPairing(null);
    setName("");
    setError(null);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-brand">
        {t("settings.devicesAdd")}
      </button>
    );
  }

  const remaining = pairing ? pairing.expiresAt - now : 0;
  const expired = pairing !== null && remaining <= 0;
  const pairUrl = pairing ? `${origin}/door/pair/${pairing.code}` : "";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="card w-full max-w-md p-5 space-y-4 bg-[var(--card)]">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{t("settings.devicesPairTitle")}</h2>
          <button onClick={close} aria-label={t("common.close")}>
            <X className="w-4 h-4 text-[var(--muted)]" />
          </button>
        </div>

        {!pairing && (
          <>
            <label className="block text-sm font-medium">{t("settings.deviceName")}</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("settings.deviceNamePlaceholder")}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              onClick={start}
              disabled={isPending || name.trim().length < 2}
              className="btn-brand w-full"
            >
              {isPending ? t("settings.deviceCreating") : t("settings.deviceContinue")}
            </button>
          </>
        )}

        {pairing && (
          <>
            <p className="text-sm text-[var(--muted)]">{t("settings.deviceScanHint")}</p>
            <div className="flex justify-center bg-white p-3 rounded-md">
              <QRCodeSVG value={pairUrl} size={200} />
            </div>
            <div className="text-center font-mono text-base tracking-wider">
              {pairing.code}
            </div>
            <div className="text-center text-sm">
              {expired ? (
                <span className="text-red-600">{t("settings.deviceExpired")}</span>
              ) : (
                <span className="text-[var(--muted)]">
                  {t("settings.deviceTimeLeft", { time: fmtCountdown(remaining) })}
                </span>
              )}
            </div>
            {error && <p className="text-sm text-red-600 text-center">{error}</p>}
            <div className="flex gap-2">
              <button onClick={close} className="btn-ghost flex-1">
                {t("common.close")}
              </button>
              {expired && (
                <button onClick={regen} disabled={isPending} className="btn-brand flex-1">
                  {t("settings.deviceNewCode")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
