"use client";

import { useActionState } from "react";
import { createMember, updateMember, type MemberFormState } from "@/lib/member-actions";
import type { PlanType } from "@/generated/prisma/enums";
import { PLAN_TYPES, PLANS } from "@/config/gym-plans";

export type MemberFormDefaults = {
  name: string;
  phone: string;
  email: string;
  planType: PlanType;
  planPrice: number;
  startDate: string;
  notes: string;
  unlimitedEntries?: boolean;
};

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
          {PLAN_TYPES.map((v) => (
            <option key={v} value={v}>
              {PLANS[v].label}
              {PLANS[v].maxEntries != null ? ` — ${PLANS[v].maxEntries} giriş/ay` : ""}
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
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="unlimitedEntries"
          name="unlimitedEntries"
          value="true"
          defaultChecked={props.defaults.unlimitedEntries ?? false}
          className="h-4 w-4 rounded border-neutral-300"
        />
        <label htmlFor="unlimitedEntries" className="text-sm">
          Gündə bir dəfədən çox girişə icazə ver
        </label>
      </div>
      {/* The per-cycle entry cap is driven by the selected plan (e.g. "12 giriş"
          → 12/ay) in member-actions, so there is no manual limit field. */}
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
