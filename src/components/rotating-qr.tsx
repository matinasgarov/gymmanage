"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  requestScanToken,
  transferPassDevice,
  type ScanTokenResult,
} from "@/lib/qr-actions";

type TransferError = "wrong" | "rate";

type View =
  | { kind: "loading" }
  | { kind: "ok"; scanUrl: string; expiresAt: number }
  | { kind: "transfer"; error?: TransferError }
  | { kind: "invalid" };

function toView(r: ScanTokenResult): View {
  if (r.status === "ok") return { kind: "ok", scanUrl: r.scanUrl, expiresAt: r.expiresAt };
  if (r.status === "needs_transfer") return { kind: "transfer" };
  if (r.status === "wrong_code") return { kind: "transfer", error: "wrong" };
  if (r.status === "rate_limited") return { kind: "transfer", error: "rate" };
  return { kind: "invalid" };
}

export function RotatingQR(props: {
  memberId: string;
  urlToken: string;
  size?: number;
}) {
  const { memberId, urlToken } = props;
  const [view, setView] = useState<View>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    startTransition(async () => {
      const r = await requestScanToken(memberId, urlToken);
      setView(toView(r));
    });
  }, [memberId, urlToken]);

  const transfer = useCallback(
    (digits: string) => {
      startTransition(async () => {
        const r = await transferPassDevice(memberId, urlToken, digits);
        if (r.status === "ok") setCode("");
        setView(toView(r));
      });
    },
    [memberId, urlToken]
  );

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

  if (view.kind === "transfer") {
    const locked = view.error === "rate";
    const canSubmit = code.length === 4 && !pending && !locked;
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) transfer(code);
        }}
        className="flex flex-col items-center gap-3 text-center"
        style={{ width: props.size ?? 240 }}
      >
        <p className="text-sm text-neutral-600">
          Kartı bu telefonda açmaq üçün telefon nömrənizin son 4 rəqəmini daxil edin.
        </p>
        <input
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
          placeholder="••••"
          className="w-32 rounded-lg border border-neutral-300 px-3 py-2 text-center text-2xl tracking-[0.5em] tabular-nums"
        />
        {view.error === "wrong" && (
          <p className="text-xs text-red-600">Rəqəmlər uyğun gəlmir.</p>
        )}
        {locked && (
          <p className="text-xs text-red-600">Çox cəhd. Bir azdan yenidən yoxlayın.</p>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending ? "Yoxlanılır…" : "Təsdiqlə"}
        </button>
        <p className="text-[11px] text-neutral-400">
          Təsdiqlədikdən sonra digər telefonda QR işləməyəcək.
        </p>
      </form>
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
