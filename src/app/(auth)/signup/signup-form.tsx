"use client";

import { useActionState } from "react";
import { signup, type FormState } from "@/lib/auth-actions";
import { useT } from "@/components/i18n-provider";

const initial: FormState = undefined;

export function SignupForm() {
  const t = useT();
  const [state, action, pending] = useActionState(signup, initial);

  return (
    <form action={action} className="space-y-4 bg-white p-6 rounded-lg shadow-sm border">
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
      {state?.message && <p className="text-sm text-red-600">{state.message}</p>}
      <button type="submit" disabled={pending} className="btn-brand w-full">
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
      <label htmlFor={props.name} className="block text-sm font-medium mb-1">
        {props.label}
      </label>
      <input
        id={props.name}
        name={props.name}
        type={props.type ?? "text"}
        placeholder={props.placeholder}
        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-black/20"
      />
      {props.errors?.length ? (
        <p className="text-xs text-red-600 mt-1">{props.errors[0]}</p>
      ) : null}
    </div>
  );
}
