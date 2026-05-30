"use client";

import { useActionState } from "react";
import { createMember, updateMember, type MemberFormState } from "@/lib/member-actions";

export type MemberFormDefaults = {
  name: string;
  phone: string;
  email: string;
  planType: "MONTHLY" | "QUARTERLY" | "ANNUAL";
  planPrice: number;
  startDate: string;
  notes: string;
};

const PLAN_LABEL = {
  MONTHLY: "Aylıq",
  QUARTERLY: "Rüblük (3 ay)",
  ANNUAL: "İllik",
} as const;

const initial: MemberFormState = undefined;

export function MemberForm(props: {
  mode: "create" | "edit";
  memberId?: string;
  leadId?: string;
  defaults: MemberFormDefaults;
}) {
  const action = props.mode === "create"
    ? createMember
    : updateMember.bind(null, props.memberId!);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="space-y-4">
      {props.leadId && <input type="hidden" name="leadId" value={props.leadId} />}
      <Field
        label="Ad və soyad"
        name="name"
        defaultValue={props.defaults.name}
        errors={state?.errors?.name}
      />
      <Field
        label="Telefon"
        name="phone"
        type="tel"
        defaultValue={props.defaults.phone}
        errors={state?.errors?.phone}
      />
      <Field
        label="Email (ixtiyari)"
        name="email"
        type="email"
        defaultValue={props.defaults.email}
        errors={state?.errors?.email}
      />
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="planType">
          Plan
        </label>
        <select
          id="planType"
          name="planType"
          defaultValue={props.defaults.planType}
          className="w-full px-3 py-2 border rounded-md bg-white"
        >
          {Object.entries(PLAN_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <Field
        label="Qiymət (₼)"
        name="planPrice"
        type="number"
        step="0.01"
        defaultValue={String(props.defaults.planPrice)}
        errors={state?.errors?.planPrice}
      />
      <Field
        label="Başlama tarixi"
        name="startDate"
        type="date"
        defaultValue={props.defaults.startDate}
        errors={state?.errors?.startDate}
      />
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="notes">
          Qeyd (ixtiyari)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={props.defaults.notes}
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>
      {state?.message && <p className="text-sm text-red-600">{state.message}</p>}
      <button
        type="submit"
        disabled={pending}
        className="btn-brand w-full"
      >
        {pending
          ? "Saxlanılır…"
          : props.mode === "create"
            ? "Saxla və QR yarat"
            : "Yenilə"}
      </button>
    </form>
  );
}

function Field(props: {
  label: string;
  name: string;
  type?: string;
  step?: string;
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
        step={props.step}
        defaultValue={props.defaultValue}
        className="w-full px-3 py-2 border rounded-md"
      />
      {props.errors?.[0] && (
        <p className="text-xs text-red-600 mt-1">{props.errors[0]}</p>
      )}
    </div>
  );
}
