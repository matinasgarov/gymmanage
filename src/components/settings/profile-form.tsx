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
    <form action={action} className="space-y-3">
      <Field label={t("settings.gymName")} name="name" defaultValue={defaults.name} errors={state?.errors?.name} />
      <Field label={t("settings.ownerName")} name="ownerName" defaultValue={defaults.ownerName} errors={state?.errors?.ownerName} />
      <Field label={t("memberForm.phone")} name="phone" type="tel" defaultValue={defaults.phone} errors={state?.errors?.phone} />
      <Field label={t("settings.address")} name="address" defaultValue={defaults.address} errors={state?.errors?.address} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-brand">
          {pending ? t("common.saving") : t("settings.saveProfile")}
        </button>
        {state?.ok && state.message && (
          <span className="text-xs text-emerald-700">{state.message}</span>
        )}
        {!state?.ok && state?.message && (
          <span className="text-xs text-red-600">{state.message}</span>
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
    <div>
      <label htmlFor={props.name} className="block text-sm font-medium mb-1">
        {props.label}
      </label>
      <input
        id={props.name}
        name={props.name}
        type={props.type ?? "text"}
        defaultValue={props.defaultValue}
        className="w-full px-3 py-2 border border-[var(--border)] rounded-md"
      />
      {props.errors?.[0] && (
        <p className="text-xs text-red-600 mt-1">{props.errors[0]}</p>
      )}
    </div>
  );
}
