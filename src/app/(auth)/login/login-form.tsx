"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, type FormState } from "@/lib/auth-actions";
import { useT } from "@/components/i18n-provider";

const initial: FormState = undefined;

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--d-tx2)",
  marginBottom: 6,
};
const errorStyle: React.CSSProperties = {
  fontSize: 11.5,
  color: "#ef4444",
  marginTop: 5,
};

export function LoginForm() {
  const t = useT();
  const [state, action, pending] = useActionState(login, initial);

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <label htmlFor="email" style={labelStyle}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="siz@example.com"
          className="md-input"
          style={{ height: 42 }}
        />
        {state?.errors?.email?.[0] && <p style={errorStyle}>{state.errors.email[0]}</p>}
      </div>
      <div>
        <label htmlFor="password" style={labelStyle}>
          {t("auth.loginPassword")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="md-input"
          style={{ height: 42 }}
        />
        {state?.errors?.password?.[0] && <p style={errorStyle}>{state.errors.password[0]}</p>}
      </div>
      <div style={{ textAlign: "right", marginTop: -6 }}>
        <Link href="/forgot-password" style={{ fontSize: 12, color: "#3b7bf6", fontWeight: 600, textDecoration: "none" }}>
          {t("auth.loginForgot")}
        </Link>
      </div>
      {state?.message && <p style={{ fontSize: 13, color: "#ef4444" }}>{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="btn-primary"
        style={{ width: "100%", justifyContent: "center", height: 44, opacity: pending ? 0.6 : 1 }}
      >
        {pending ? t("auth.loginChecking") : t("auth.loginSubmit")}
      </button>
    </form>
  );
}
