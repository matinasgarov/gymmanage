"use client";

import { useEffect, useState, useTransition } from "react";
import { QRCodeSVG } from "qrcode.react";
import { refreshScanTokenForPass, type FreshScanToken } from "@/lib/qr-actions";

export function RotatingQR(props: {
  memberId: string;
  urlToken: string;
  initial: FreshScanToken;
  size?: number;
}) {
  const [data, setData] = useState<FreshScanToken>(props.initial);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const tick = () => {
      setSecondsLeft(Math.max(0, Math.round((data.expiresAt - Date.now()) / 1000)));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [data.expiresAt]);

  useEffect(() => {
    const delay = Math.max(1000, data.expiresAt - Date.now());
    const t = setTimeout(() => {
      startTransition(async () => {
        const next = await refreshScanTokenForPass(props.memberId, props.urlToken);
        if (next) setData(next);
      });
    }, delay);
    return () => clearTimeout(t);
  }, [data.expiresAt, props.memberId, props.urlToken]);

  return (
    <div className="inline-flex flex-col items-center gap-2">
      <div className="bg-white p-4 rounded-lg border">
        <QRCodeSVG
          value={data.scanUrl}
          size={props.size ?? 240}
          level="M"
          marginSize={0}
        />
      </div>
      <p className="text-xs text-neutral-500" suppressHydrationWarning>
        QR avtomatik yenilənir{secondsLeft !== null ? ` · ${secondsLeft}s` : ""}
      </p>
    </div>
  );
}
