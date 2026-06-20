"use client";

import { useActionState } from "react";
import { signup, type FormState } from "@/lib/auth-actions";
import { useT } from "@/components/i18n-provider";

const initial: FormState = undefined;

export function SignupForm() {
  const t = useT();
  const [state, action, pending] = useActionState(signup, initial);

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Field
        label={t("settings.gymName")}
        name="gymName"
        placeholder="IronZone Gym"
        errors={state?.errors?.gymName}
      />
      <Field
        label={t("auth.signupOwnerName")}
        name="ownerName"
        placeholder="Əli Məmmədov"
        errors={state?.errors?.ownerName}
      />
      <Field
        label={t("memberForm.phone")}
        name="phone"
        type="tel"
        placeholder="+994501234567"
        errors={state?.errors?.phone}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        placeholder="siz@example.com"
        errors={state?.errors?.email}
      />
      <Field
        label={t("auth.loginPassword")}
        name="password"
        type="password"
        placeholder={t("auth.signupPasswordPlaceholder")}
        errors={state?.errors?.password}
      />
      {state?.message && <p style={{ fontSize: 13, color: "#ef4444" }}>{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="btn-primary"
        style={{ width: "100%", justifyContent: "center", height: 44, marginTop: 2, opacity: pending ? 0.6 : 1 }}
      >
        {pending ? t("auth.signupCreating") : t("auth.signupSubmit")}
      </button>
    </form>
  );
}

function Field(props: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  errors?: string[];
}) {
  return (
    <div>
      <label
        htmlFor={props.name}
        style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "var(--d-tx2)", marginBottom: 6 }}
      >
        {props.label}
      </label>
      <input
        id={props.name}
        name={props.name}
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        className="md-input"
        style={{ height: 42 }}
      />
      {props.errors?.length ? (
        <p style={{ fontSize: 11.5, color: "#ef4444", marginTop: 5 }}>{props.errors[0]}</p>
      ) : null}
    </div>
  );
}
