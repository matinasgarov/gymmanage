"use client";

import { useState, useEffect, useTransition } from "react";
import { QRCodeSVG } from "qrcode.react";
import { X } from "lucide-react";
import {
  createScannerPairing,
  regeneratePairing,
  type PairingResult,
} from "@/lib/scanner-device-actions";

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

export function PairDeviceDialog({ origin }: { origin: string }) {
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
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
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
        + Yeni cihaz əlavə et
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
          <h2 className="font-medium">Skaner cihazını qoş</h2>
          <button onClick={close} aria-label="Bağla">
            <X className="w-4 h-4 text-[var(--muted)]" />
          </button>
        </div>

        {!pairing && (
          <>
            <label className="block text-sm font-medium">Cihazın adı</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Qapı telefonu"
              className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              onClick={start}
              disabled={isPending || name.trim().length < 2}
              className="btn-brand w-full"
            >
              {isPending ? "Yaradılır..." : "Davam et"}
            </button>
          </>
        )}

        {pairing && (
          <>
            <p className="text-sm text-[var(--muted)]">
              Telefonun kamerası ilə QR-ı skan et, yaxud aşağıdakı kodu daxil et.
            </p>
            <div className="flex justify-center bg-white p-3 rounded-md">
              <QRCodeSVG value={pairUrl} size={200} />
            </div>
            <div className="text-center font-mono text-base tracking-wider">
              {pairing.code}
            </div>
            <div className="text-center text-sm">
              {expired ? (
                <span className="text-red-600">Vaxtı keçdi</span>
              ) : (
                <span className="text-[var(--muted)]">
                  Qalan vaxt: {fmtCountdown(remaining)}
                </span>
              )}
            </div>
            {error && <p className="text-sm text-red-600 text-center">{error}</p>}
            <div className="flex gap-2">
              <button onClick={close} className="btn-ghost flex-1">
                Bağla
              </button>
              {expired && (
                <button
                  onClick={regen}
                  disabled={isPending}
                  className="btn-brand flex-1"
                >
                  Yeni kod yarat
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
