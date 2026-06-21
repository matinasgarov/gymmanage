"use client";

import { useActionState, useState, useTransition } from "react";
import { verifyTwoFactor, resendTwoFactor, type FormState } from "@/lib/auth-actions";
import { useT } from "@/components/i18n-provider";

const initial: FormState = undefined;

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--d-tx2)",
  marginBottom: 6,
};
const errorStyle: React.CSSProperties = { fontSize: 11.5, color: "#ef4444", marginTop: 5 };

export function VerifyForm() {
  const t = useT();
  const [state, action, pending] = useActionState(verifyTwoFactor, initial);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const [resending, startResend] = useTransition();

  function onResend() {
    setResendMsg(null);
    startResend(async () => {
      const res = await resendTwoFactor();
      setResendMsg(res?.message ?? null);
    });
  }

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <label htmlFor="code" style={labelStyle}>
          {t("auth.verifyCodeLabel")}
        </label>
        <input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          className="md-input"
          style={{ height: 46, fontSize: 20, fontWeight: 700, letterSpacing: "6px", textAlign: "center" }}
        />
        {state?.errors?.code?.[0] && <p style={errorStyle}>{state.errors.code[0]}</p>}
      </div>
      {state?.message && <p style={{ fontSize: 13, color: "#ef4444" }}>{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="btn-primary"
        style={{ width: "100%", justifyContent: "center", height: 44, opacity: pending ? 0.6 : 1 }}
      >
        {pending ? t("auth.loginChecking") : t("auth.verifySubmit")}
      </button>
      <div style={{ textAlign: "center" }}>
        <button
          type="button"
          onClick={onResend}
          disabled={resending}
          style={{
            fontSize: 12.5,
            color: "#3b7bf6",
            fontWeight: 600,
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          {resending ? t("auth.verifyResending") : t("auth.verifyResend")}
        </button>
        {resendMsg && (
          <p style={{ fontSize: 11.5, color: "var(--d-tx3)", marginTop: 4 }}>{resendMsg}</p>
        )}
      </div>
    </form>
  );
}
