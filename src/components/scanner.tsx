"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Search, ChevronDown } from "lucide-react";
import { verifyScan, overrideScan, manualLookup, type ScanResult } from "@/lib/scan-actions";
import { useT } from "@/components/i18n-provider";

type ScannerState =
  | { mode: "idle" }
  | { mode: "scanning" }
  | { mode: "result"; result: ScanResult };

const SCANNER_ELEMENT_ID = "gympass-qr-reader";
const RESULT_DISPLAY_MS = 3500;
// Debt results carry an extra line of payment info — give staff longer to read it.
const DEBT_RESULT_DISPLAY_MS = 6000;
// Same QR can't be re-scanned within this window. Must outlive the result
// overlay + the brief moment the camera comes back up while the QR is still
// in front of the lens, so longer than RESULT_DISPLAY_MS.
const SCAN_COOLDOWN_MS = 30_000;

export function Scanner({ canOverride }: { canOverride: boolean }) {
  const t = useT();
  const [state, setState] = useState<ScannerState>({ mode: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResults, setLookupResults] = useState<
    Awaited<ReturnType<typeof manualLookup>>
  >([]);
  const [manualOpen, setManualOpen] = useState(false);
  const manualInputRef = useRef<HTMLInputElement | null>(null);
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

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError(t("scan.httpsError"));
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
        () => {}
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("scan.unknownError");
      setError(t("scan.cameraError", { msg }));
      setState({ mode: "idle" });
    }
  }, [handleDecoded, t]);

  const reset = useCallback(() => {
    setState({ mode: "idle" });
  }, []);

  useEffect(() => {
    if (state.mode !== "result") return;
    const delay = state.result.ok && state.result.debt ? DEBT_RESULT_DISPLAY_MS : RESULT_DISPLAY_MS;
    const timer = setTimeout(() => {
      void startCamera();
    }, delay);
    return () => clearTimeout(timer);
  }, [state, startCamera]);

  useEffect(() => () => { void stopCamera(); }, [stopCamera]);

  useEffect(() => {
    // Camera init on mount is an external-system sync, not a render-derived state update.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void startCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lookupQuery.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear debounced results
      setLookupResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const rows = await manualLookup(lookupQuery);
      setLookupResults(rows);
    }, 250);
    return () => clearTimeout(timer);
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

  const scanning = state.mode === "scanning";
  const status = error
    ? { dot: "#ef4444", text: t("scan.statusError"), stopped: true }
    : scanning
      ? { dot: "#10b981", text: t("scan.statusScanning"), stopped: false }
      : { dot: "#8aa0bc", text: t("scan.statusStopped"), stopped: true };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Viewfinder */}
      <div className="vf-card">
        <div id={SCANNER_ELEMENT_ID} className="w-full h-full" />
        <div className="vf-overlay" />
        <div className={`vf-scanline${scanning ? "" : " paused"}`} />
        <div className="vf-status">
          <span
            className={`vf-status-dot${status.stopped ? " stopped" : ""}`}
            style={{ background: status.dot }}
          />
          <span>{status.text}</span>
        </div>
      </div>

      {/* Stop / Start */}
      {scanning ? (
        <button
          onClick={async () => {
            await stopCamera();
            reset();
          }}
          className="btn-scan-toggle active"
        >
          <Pause className="w-[15px] h-[15px]" fill="currentColor" strokeWidth={0} />
          {t("scan.stop")}
        </button>
      ) : (
        <button onClick={startCamera} className="btn-scan-toggle stopped">
          <Play className="w-[15px] h-[15px]" fill="currentColor" strokeWidth={0} />
          {t("scan.start")}
        </button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Manual search */}
      <div className="manual-row">
        <button
          type="button"
          className={`manual-toggle${manualOpen ? " open" : ""}`}
          onClick={() => {
            const next = !manualOpen;
            setManualOpen(next);
            if (next) setTimeout(() => manualInputRef.current?.focus(), 60);
          }}
        >
          <Search className="w-[15px] h-[15px] manual-ico" strokeWidth={2.3} />
          <span style={{ flex: 1 }}>{t("scan.manualLookup")}</span>
          <ChevronDown className="manual-toggle-arrow w-[14px] h-[14px]" strokeWidth={2.3} />
        </button>
        {manualOpen && (
          <div className="manual-body">
            <div className="manual-input-wrap">
              <input
                ref={manualInputRef}
                value={lookupQuery}
                onChange={(e) => setLookupQuery(e.target.value)}
                placeholder={t("scan.manualPlaceholder")}
                className="manual-input"
              />
            </div>
            {lookupResults.length > 0 && (
              <ul style={{ marginTop: 12, borderRadius: 10, border: "1px solid var(--d-bdr)", overflow: "hidden" }}>
                {lookupResults.map((m, i) => (
                  <li
                    key={m.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 12px",
                      borderBottom: i < lookupResults.length - 1 ? "1px solid var(--d-bdr)" : "none",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--d-tx)" }}>{m.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--d-tx3)", fontWeight: 500 }}>
                        {m.publicId} · {m.phone}
                      </div>
                    </div>
                    {canOverride ? (
                      <ManualOverrideButton memberId={m.id} />
                    ) : (
                      <span style={{ fontSize: 11.5, color: "var(--d-tx3)" }}>{m.status}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultOverlay(props: {
  result: ScanResult;
  canOverride: boolean;
  onDismiss: () => void;
}) {
  const t = useT();
  const { result } = props;
  const granted = result.ok;
  const debt = result.ok ? result.debt : undefined;
  const bg = !granted ? "bg-red-600" : debt ? "bg-amber-600" : "bg-green-600";
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
        {granted ? t("scan.granted") : t("scan.denied")}
      </div>
      {result.ok ? (
        <>
          <div className="text-lg">{result.member.name}</div>
          <div className="text-sm opacity-90">
            {result.member.publicId} · {t("scan.expiryLabel")} {result.member.expiryDate}
          </div>
          {debt && (
            <div className="mt-3 bg-white/25 rounded-md px-4 py-2 w-full max-w-xs">
              <div className="text-base font-semibold">
                {t("scan.debtLine", {
                  amount: debt.amount.toFixed(2),
                  period: debt.periodLabel,
                })}
              </div>
              <div className="text-sm">
                {t("scan.debtGrace", { count: debt.graceDaysLeft })}
              </div>
            </div>
          )}
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
      <p className="text-xs opacity-75 mt-6">{t("scan.tapToContinue")}</p>
    </div>
  );
}

function OverrideForm({ memberId }: { memberId: string }) {
  const t = useT();
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  return (
    <div
      className="mt-4 bg-white/15 rounded-md p-3 w-full max-w-xs"
      onClick={(e) => e.stopPropagation()}
    >
      {done ? (
        <p className="text-sm">{t("scan.overrideDone")}</p>
      ) : (
        <>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("scan.overrideNote")}
            className="w-full px-2 py-1 rounded text-black text-sm"
          />
          <button
            onClick={async () => {
              await overrideScan(memberId, note);
              setDone(true);
            }}
            className="mt-2 w-full bg-white text-red-700 rounded px-3 py-1.5 text-sm font-medium"
          >
            {t("scan.overrideApprove")}
          </button>
        </>
      )}
    </div>
  );
}

function ManualOverrideButton({ memberId }: { memberId: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return done ? (
    <span className="text-xs text-green-700">{t("scan.manualApproved")}</span>
  ) : (
    <button
      onClick={async () => {
        await overrideScan(memberId, "no-phone-entry");
        setDone(true);
      }}
      className="text-xs bg-green-600 text-white px-2 py-1 rounded"
    >
      {t("scan.manualApprove")}
    </button>
  );
}
