"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { submitLead, type LeadFormState } from "@/lib/lead-actions";
import { PLAN_TYPES } from "@/config/gym-plans";
import { useT } from "@/components/i18n-provider";

const initial: LeadFormState = undefined;

export function JoinForm({ gymId }: { gymId: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(submitLead, initial);

  if (state?.ok) {
    return (
      <div className="bg-white rounded-xl shadow-sm border p-6 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
        <h2 className="font-semibold mb-1">{t("join.thanks")}</h2>
        <p className="text-sm text-neutral-600">{t("join.successText")}</p>
      </div>
    );
  }

  return (
    <form action={action} className="bg-white rounded-xl shadow-sm border p-5 space-y-3">
      <input type="hidden" name="gymId" value={gymId} />

      <Field
        label={t("join.nameLabel")}
        name="name"
        placeholder={t("join.namePlaceholder")}
        errors={state?.errors?.name}
      />
      <Field
        label={t("join.phone")}
        name="phone"
        type="tel"
        placeholder="+994501234567"
        errors={state?.errors?.phone}
      />

      <div>
        <label htmlFor="interest" className="block text-sm font-medium mb-1">
          {t("join.interestLabel")}
        </label>
        <select
          id="interest"
          name="interest"
          defaultValue=""
          className="w-full px-3 py-2 border rounded-md bg-white"
        >
          <option value="">{t("join.undecided")}</option>
          {PLAN_TYPES.map((p) => (
            <option key={p} value={p}>
              {t(`plan.${p}`)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="message" className="block text-sm font-medium mb-1">
          {t("join.noteLabel")}
        </label>
        <textarea
          id="message"
          name="message"
          rows={2}
          placeholder={t("join.notePlaceholder")}
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>

      {state?.message && !state.ok && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}

      <button type="submit" disabled={pending} className="btn-brand w-full">
        {pending ? t("join.sending") : t("join.submit")}
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
        className="w-full px-3 py-2 border rounded-md"
      />
      {props.errors?.[0] && (
        <p className="text-xs text-red-600 mt-1">{props.errors[0]}</p>
      )}
    </div>
  );
}
