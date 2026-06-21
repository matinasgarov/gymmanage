"use client";

import { useActionState, useState, useTransition } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import {
  startEnableTwoFactor,
  confirmEnableTwoFactor,
  disableTwoFactor,
  type FormState,
} from "@/lib/auth-actions";
import { useT } from "@/components/i18n-provider";

const initial: FormState = undefined;

export function TwoFactorForm({ enabled }: { enabled: boolean }) {
  if (enabled) return <DisablePanel />;
  return <EnablePanel />;
}

function EnablePanel() {
  const t = useT();
  const [codeSent, setCodeSent] = useState(false);
  const [startMsg, setStartMsg] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const [confirmState, confirmAction, confirming] = useActionState(confirmEnableTwoFactor, initial);

  function sendCode() {
    setStartMsg(null);
    startSending(async () => {
      const res = await startEnableTwoFactor();
      setStartMsg(res?.message ?? null);
      setCodeSent(true);
    });
  }

  // Once enabled the server revalidates /settings, which re-renders with the
  // DisablePanel — so a success here just shows the confirmation message.
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ShieldOff style={{ width: 16, height: 16, color: "var(--d-tx3)" }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--d-tx2)" }}>
          {t("twoFactor.statusOff")}
        </span>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--d-tx3)" }}>{t("twoFactor.enableHint")}</p>

      {!codeSent ? (
        <button
          type="button"
          onClick={sendCode}
          disabled={sending}
          className="btn-primary"
          style={{ alignSelf: "flex-start", opacity: sending ? 0.6 : 1 }}
        >
          {sending ? t("common.saving") : t("twoFactor.sendCode")}
        </button>
      ) : (
        <form action={confirmAction} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {startMsg && <p style={{ fontSize: 12.5, color: "#10b981" }}>{startMsg}</p>}
          <label htmlFor="2fa-enable-code" className="md-field-label">
            {t("twoFactor.codeLabel")}
          </label>
          <input
            id="2fa-enable-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="000000"
            className="md-input"
            style={{ maxWidth: 180, letterSpacing: "4px", fontWeight: 700, textAlign: "center" }}
          />
          {confirmState?.errors?.code?.[0] && (
            <p style={{ fontSize: 11.5, fontWeight: 600, color: "#ef4444" }}>{confirmState.errors.code[0]}</p>
          )}
          {confirmState?.message && (
            <p style={{ fontSize: 12.5, fontWeight: 600, color: "#10b981" }}>{confirmState.message}</p>
          )}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button type="submit" disabled={confirming} className="btn-primary" style={{ opacity: confirming ? 0.6 : 1 }}>
              {confirming ? t("common.saving") : t("twoFactor.confirmEnable")}
            </button>
            <button
              type="button"
              onClick={sendCode}
              disabled={sending}
              style={{ fontSize: 12.5, color: "#3b7bf6", fontWeight: 600, background: "none", border: "none", cursor: "pointer" }}
            >
              {t("twoFactor.resend")}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function DisablePanel() {
  const t = useT();
  const [state, action, pending] = useActionState(disableTwoFactor, initial);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <ShieldCheck style={{ width: 16, height: 16, color: "#10b981" }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>
          {t("twoFactor.statusOn")}
        </span>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--d-tx3)" }}>{t("twoFactor.disableHint")}</p>
      <form action={action} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label htmlFor="2fa-disable-password" className="md-field-label">
          {t("twoFactor.passwordLabel")}
        </label>
        <input
          id="2fa-disable-password"
          name="password"
          type="password"
          className="md-input"
          style={{ maxWidth: 280 }}
        />
        {state?.errors?.password?.[0] && (
          <p style={{ fontSize: 11.5, fontWeight: 600, color: "#ef4444" }}>{state.errors.password[0]}</p>
        )}
        {state?.message && (
          <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--d-tx2)" }}>{state.message}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="md-btn-delete"
          style={{ width: "auto", padding: "0 16px", alignSelf: "flex-start", opacity: pending ? 0.6 : 1 }}
        >
          {pending ? t("common.saving") : t("twoFactor.disable")}
        </button>
      </form>
    </div>
  );
}
