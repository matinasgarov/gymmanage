"use client";

import { useActionState } from "react";
import { createMember, updateMember, type MemberFormState } from "@/lib/member-actions";
import type { PlanType } from "@/generated/prisma/enums";
import { PLAN_TYPES, PLANS } from "@/config/gym-plans";
import { useT } from "@/components/i18n-provider";

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
  const t = useT();
  const action = props.mode === "create"
    ? createMember
    : updateMember.bind(null, props.memberId!);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="space-y-4">
      {props.leadId && <input type="hidden" name="leadId" value={props.leadId} />}
      <Field
        label={t("memberForm.name")}
        name="name"
        defaultValue={props.defaults.name}
        errors={state?.errors?.name}
      />
      <Field
        label={t("memberForm.phone")}
        name="phone"
        type="tel"
        defaultValue={props.defaults.phone}
        errors={state?.errors?.phone}
      />
      <Field
        label={t("memberForm.email")}
        name="email"
        type="email"
        defaultValue={props.defaults.email}
        errors={state?.errors?.email}
      />
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="planType">
          {t("memberForm.plan")}
        </label>
        <select
          id="planType"
          name="planType"
          defaultValue={props.defaults.planType}
          className="w-full px-3 py-2 border rounded-md bg-white"
        >
          {PLAN_TYPES.map((v) => (
            <option key={v} value={v}>
              {t(`plan.${v}`)}
              {PLANS[v].maxEntries != null
                ? ` — ${t("memberForm.entriesPerMonth", { count: PLANS[v].maxEntries! })}`
                : ""}
            </option>
          ))}
        </select>
      </div>
      <Field
        label={t("memberForm.price")}
        name="planPrice"
        type="number"
        step="0.01"
        defaultValue={String(props.defaults.planPrice)}
        errors={state?.errors?.planPrice}
      />
      <Field
        label={t("memberForm.startDate")}
        name="startDate"
        type="date"
        defaultValue={props.defaults.startDate}
        errors={state?.errors?.startDate}
      />
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="notes">
          {t("memberForm.notes")}
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
          {t("memberForm.unlimitedEntries")}
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
          ? t("memberForm.saving")
          : props.mode === "create"
            ? t("memberForm.create")
            : t("memberForm.update")}
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
