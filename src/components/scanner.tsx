"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { verifyScan, overrideScan, manualLookup, type ScanResult } from "@/lib/scan-actions";

type ScannerState =
  | { mode: "idle" }
  | { mode: "scanning" }
  | { mode: "result"; result: ScanResult };

const SCANNER_ELEMENT_ID = "gympass-qr-reader";
const RESULT_DISPLAY_MS = 3500;
// Same QR can't be re-scanned within this window. Must outlive the result
// overlay + the brief moment the camera comes back up while the QR is still
// in front of the lens, so longer than RESULT_DISPLAY_MS.
const SCAN_COOLDOWN_MS = 30_000;

export function Scanner({ canOverride }: { canOverride: boolean }) {
  const [state, setState] = useState<ScannerState>({ mode: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResults, setLookupResults] = useState<
    Awaited<ReturnType<typeof manualLookup>>
  >([]);
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const lastTokenRef = useRef<{ token: string; t: number } | null>(null);
  const busyRef = useRef(false);

  const stopCamera = useCallback(async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        scannerRef.current = null;
      }
    } catch {
      // ignore — html5-qrcode throws if already stopped
    }
  }, []);

  const handleDecoded = useCallback(async (text: string) => {
    if (busyRef.current) return;
    const now = Date.now();
    if (
      lastTokenRef.current &&
      lastTokenRef.current.token === text &&
      now - lastTokenRef.current.t < SCAN_COOLDOWN_MS
    ) {
      return;
    }
    lastTokenRef.current = { token: text, t: now };
    busyRef.current = true;
    try {
      await stopCamera();
      const result = await verifyScan(text);
      setState({ mode: "result", result });
      // Keep busyRef=true until the camera is explicitly restarted via
      // startCamera() — prevents the overlay flickering off as new decodes
      // from buffered camera frames arrive.
    } catch {
      busyRef.current = false;
    }
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    setError(null);
    busyRef.current = false;
    // Intentionally keep lastTokenRef — the just-scanned QR is still likely
    // in front of the camera when it restarts. Cooldown keeps it from firing
    // again. A different QR will scan immediately.

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError(
        "Kamera yalnız HTTPS-də işləyir. Telefonda test üçün tunel (məsələn cloudflared) istifadə edin."
      );
      return;
    }

    setState({ mode: "scanning" });

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const instance = new Html5Qrcode(SCANNER_ELEMENT_ID, { verbose: false });
      scannerRef.current = {
        stop: async () => {
          try {
            await instance.stop();
          } catch {}
          try {
            instance.clear();
          } catch {}
        },
      };
      await instance.start(
        { facingMode: "environment" },
        {
          fps: 10,
          // Responsive scan box: 70% of the smaller camera dimension so it
          // scales with the device instead of a fixed 260px square.
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const size = Math.round(
              Math.min(viewfinderWidth, viewfinderHeight) * 0.7
            );
            return { width: size, height: size };
          },
        },
        (decoded) => {
          handleDecoded(decoded);
        },
        () => {
          // per-frame decode failures are normal, ignore
        }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Naməlum xəta";
      setError(
        `Kameranı açmaq mümkün olmadı: ${msg}. Brauzerin kamera icazəsini yoxlayın.`
      );
      setState({ mode: "idle" });
    }
  }, [handleDecoded]);

  const reset = useCallback(() => {
    setState({ mode: "idle" });
  }, []);

  // Auto-restart camera after result is shown
  useEffect(() => {
    if (state.mode !== "result") return;
    const t = setTimeout(() => {
      void startCamera();
    }, RESULT_DISPLAY_MS);
    return () => clearTimeout(t);
  }, [state, startCamera]);

  // Stop the camera on unmount
  useEffect(() => () => { void stopCamera(); }, [stopCamera]);

  // Auto-start camera as soon as the page mounts — staff shouldn't need an extra tap
  useEffect(() => {
    void startCamera();
    // Only on first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Manual lookup debounce
  useEffect(() => {
    if (lookupQuery.trim().length < 2) {
      setLookupResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const rows = await manualLookup(lookupQuery);
      setLookupResults(rows);
    }, 250);
    return () => clearTimeout(t);
  }, [lookupQuery]);

  if (state.mode === "result") {
    return (
      <ResultOverlay
        result={state.result}
        canOverride={canOverride}
        onDismiss={() => {
          void startCamera();
        }}
      />
    );
  }

  return (
    <div>
      <div className="bg-black rounded-lg overflow-hidden mb-3" style={{ aspectRatio: "1 / 1" }}>
        <div id={SCANNER_ELEMENT_ID} className="w-full h-full" />
      </div>

      {state.mode === "idle" && (
        <button
          onClick={startCamera}
          className="btn-brand w-full"
        >
          Skanı başlat
        </button>
      )}
      {state.mode === "scanning" && (
        <button
          onClick={async () => {
            await stopCamera();
            reset();
          }}
          className="btn-ghost w-full"
        >
          Dayandır
        </button>
      )}

      {error && (
        <p className="text-sm text-red-600 mt-3">{error}</p>
      )}

      <details className="mt-6 bg-white border rounded-lg">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          Telefonu yoxdur? Əl ilə tap
        </summary>
        <div className="p-4 border-t">
          <input
            value={lookupQuery}
            onChange={(e) => setLookupQuery(e.target.value)}
            placeholder="Ad, telefon və ya ID…"
            className="w-full px-3 py-2 border rounded-md"
          />
          {lookupResults.length > 0 && (
            <ul className="mt-3 divide-y border rounded-md">
              {lookupResults.map((m) => (
                <li key={m.id} className="px-3 py-2 flex justify-between items-center text-sm">
                  <div>
                    <div className="font-medium">{m.name}</div>
                    <div className="text-xs text-neutral-600">
                      {m.publicId} · {m.phone}
                    </div>
                  </div>
                  {canOverride ? (
                    <ManualOverrideButton memberId={m.id} />
                  ) : (
                    <span className="text-xs text-neutral-500">{m.status}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}

function ResultOverlay(props: {
  result: ScanResult;
  canOverride: boolean;
  onDismiss: () => void;
}) {
  const { result } = props;
  const granted = result.ok;
  const bg = granted ? "bg-green-600" : "bg-red-600";
  const photoUrl = result.ok ? result.member.photoUrl : result.member?.photoUrl;

  return (
    <div
      className={`${bg} text-white rounded-lg p-6 min-h-[60vh] flex flex-col items-center justify-center text-center cursor-pointer`}
      onClick={props.onDismiss}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          className="w-28 h-28 rounded-full object-cover border-4 border-white/80 mb-3"
        />
      ) : (
        <div className="text-6xl mb-3">{granted ? "✓" : "✕"}</div>
      )}
      <div className="text-2xl font-semibold mb-1">
        {granted ? "GİRİŞ İCAZƏLİDİR" : "GİRİŞ QADAĞANDIR"}
      </div>
      {result.ok ? (
        <>
          <div className="text-lg">{result.member.name}</div>
          <div className="text-sm opacity-90">
            {result.member.publicId} · Bitmə: {result.member.expiryDate}
          </div>
        </>
      ) : (
        <>
          <div className="text-base opacity-95 mt-2">{result.reason}</div>
          {result.member && (
            <div className="text-sm opacity-90 mt-1">
              {result.member.name} · {result.member.publicId}
            </div>
          )}
          {result.canOverride && result.member && props.canOverride && (
            <OverrideForm memberId={result.member.id} />
          )}
        </>
      )}
      <p className="text-xs opacity-75 mt-6">Davam etmək üçün toxunun…</p>
    </div>
  );
}

function OverrideForm({ memberId }: { memberId: string }) {
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  return (
    <div
      className="mt-4 bg-white/15 rounded-md p-3 w-full max-w-xs"
      onClick={(e) => e.stopPropagation()}
    >
      {done ? (
        <p className="text-sm">İcazə qeydə alındı.</p>
      ) : (
        <>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="İcazənin səbəbi"
            className="w-full px-2 py-1 rounded text-black text-sm"
          />
          <button
            onClick={async () => {
              await overrideScan(memberId, note);
              setDone(true);
            }}
            className="mt-2 w-full bg-white text-red-700 rounded px-3 py-1.5 text-sm font-medium"
          >
            Yenə icazə ver
          </button>
        </>
      )}
    </div>
  );
}

function ManualOverrideButton({ memberId }: { memberId: string }) {
  const [done, setDone] = useState(false);
  return done ? (
    <span className="text-xs text-green-700">İcazəli</span>
  ) : (
    <button
      onClick={async () => {
        await overrideScan(memberId, "Telefonsuz giriş");
        setDone(true);
      }}
      className="text-xs bg-green-600 text-white px-2 py-1 rounded"
    >
      İcazə ver
    </button>
  );
}
