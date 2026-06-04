"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  requestScanToken,
  transferPassDevice,
  type ScanTokenResult,
} from "@/lib/qr-actions";

type View =
  | { kind: "loading" }
  | { kind: "ok"; scanUrl: string; expiresAt: number }
  | { kind: "needs_transfer" }
  | { kind: "invalid" };

function toView(r: ScanTokenResult): View {
  if (r.status === "ok") return { kind: "ok", scanUrl: r.scanUrl, expiresAt: r.expiresAt };
  if (r.status === "needs_transfer") return { kind: "needs_transfer" };
  return { kind: "invalid" };
}

export function RotatingQR(props: {
  memberId: string;
  urlToken: string;
  size?: number;
}) {
  const { memberId, urlToken } = props;
  const [view, setView] = useState<View>({ kind: "loading" });
  const [now, setNow] = useState(() => Date.now());
  const [, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      const r = await requestScanToken(memberId, urlToken);
      setView(toView(r));
    });
  }, [memberId, urlToken]);

  const transfer = useCallback(() => {
    startTransition(async () => {
      const r = await transferPassDevice(memberId, urlToken);
      setView(toView(r));
    });
  }, [memberId, urlToken]);

  // Initial fetch on mount.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Tick `now` once a second (setState lives in the interval callback, not the
  // effect body) so the countdown is a pure derived value.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Schedule the next refresh just after the current token expires.
  const expiresAt = view.kind === "ok" ? view.expiresAt : null;
  useEffect(() => {
    if (expiresAt == null) return;
    const timeout = setTimeout(refresh, Math.max(1000, expiresAt - Date.now()));
    return () => clearTimeout(timeout);
  }, [expiresAt, refresh]);

  const secondsLeft =
    expiresAt != null ? Math.max(0, Math.round((expiresAt - now) / 1000)) : null;

  if (view.kind === "ok") {
    return (
      <div className="inline-flex flex-col items-center gap-2">
        <div className="bg-white p-4 rounded-lg border">
          <QRCodeSVG value={view.scanUrl} size={props.size ?? 240} level="M" marginSize={0} />
        </div>
        <p className="text-xs text-neutral-500" suppressHydrationWarning>
          QR avtomatik yenilənir{secondsLeft !== null ? ` · ${secondsLeft}s` : ""}
        </p>
      </div>
    );
  }

  if (view.kind === "needs_transfer") {
    return (
      <div className="flex flex-col items-center gap-3 text-center" style={{ width: props.size ?? 240 }}>
        <div className="flex h-32 w-full items-center justify-center rounded-lg border border-dashed border-neutral-300 px-4">
          <p className="text-sm text-neutral-600">
            Bu kart başqa cihazda aktivdir. QR kodu burada göstərmək üçün kartı bu cihaza keçirin.
          </p>
        </div>
        <button
          type="button"
          onClick={transfer}
          className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white"
        >
          Bu cihaza keçir
        </button>
        <p className="text-[11px] text-neutral-400">
          Keçirdikdən sonra digər cihazda QR işləməyəcək.
        </p>
      </div>
    );
  }

  if (view.kind === "invalid") {
    return (
      <div
        className="flex h-40 items-center justify-center rounded-lg border border-dashed border-neutral-300 px-4 text-center"
        style={{ width: props.size ?? 240 }}
      >
        <p className="text-sm text-neutral-600">Kart etibarsızdır.</p>
      </div>
    );
  }

  // loading
  return (
    <div
      className="flex h-40 items-center justify-center rounded-lg border border-neutral-200"
      style={{ width: props.size ?? 240 }}
    >
      <p className="text-xs text-neutral-400">Yüklənir…</p>
    </div>
  );
}
