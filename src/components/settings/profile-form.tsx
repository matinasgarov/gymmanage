"use client";

import { useActionState } from "react";
import { updateGymProfile, type SettingsState } from "@/lib/settings-actions";
import { useT } from "@/components/i18n-provider";

const initial: SettingsState = undefined;

export function ProfileForm({
  defaults,
}: {
  defaults: { name: string; ownerName: string; phone: string; address: string };
}) {
  const t = useT();
  const [state, action, pending] = useActionState(updateGymProfile, initial);

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Field label={t("settings.gymName")} name="name" defaultValue={defaults.name} errors={state?.errors?.name} />
      <Field label={t("settings.ownerName")} name="ownerName" defaultValue={defaults.ownerName} errors={state?.errors?.ownerName} />
      <Field label={t("memberForm.phone")} name="phone" type="tel" defaultValue={defaults.phone} errors={state?.errors?.phone} />
      <Field label={t("settings.address")} name="address" defaultValue={defaults.address} errors={state?.errors?.address} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 2 }}>
        <button type="submit" disabled={pending} className="btn-primary" style={{ opacity: pending ? 0.5 : 1 }}>
          {pending ? t("common.saving") : t("settings.saveProfile")}
        </button>
        {state?.ok && state.message && (
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#10b981" }}>{state.message}</span>
        )}
        {!state?.ok && state?.message && (
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#ef4444" }}>{state.message}</span>
        )}
      </div>
    </form>
  );
}

function Field(props: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  errors?: string[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label htmlFor={props.name} className="md-field-label">
        {props.label}
      </label>
      <input
        id={props.name}
        name={props.name}
        type={props.type ?? "text"}
        defaultValue={props.defaultValue}
        className="md-input"
      />
      {props.errors?.[0] && (
        <p style={{ fontSize: 11.5, fontWeight: 600, color: "#ef4444" }}>{props.errors[0]}</p>
      )}
    </div>
  );
}
