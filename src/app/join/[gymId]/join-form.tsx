"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { submitLead, type LeadFormState } from "@/lib/lead-actions";

const initial: LeadFormState = undefined;

export function JoinForm({ gymId }: { gymId: string }) {
  const [state, action, pending] = useActionState(submitLead, initial);

  if (state?.ok) {
    return (
      <div className="bg-white rounded-xl shadow-sm border p-6 text-center">
        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
        <h2 className="font-semibold mb-1">Təşəkkürlər!</h2>
        <p className="text-sm text-neutral-600">
          Müraciətiniz alındı. Tezliklə sizinlə əlaqə saxlanılacaq.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="bg-white rounded-xl shadow-sm border p-5 space-y-3">
      <input type="hidden" name="gymId" value={gymId} />

      <Field
        label="Adınız və soyadınız"
        name="name"
        placeholder="Əli Məmmədov"
        errors={state?.errors?.name}
      />
      <Field
        label="Telefon"
        name="phone"
        type="tel"
        placeholder="+994501234567"
        errors={state?.errors?.phone}
      />

      <div>
        <label htmlFor="interest" className="block text-sm font-medium mb-1">
          Hansı plan maraqlandırır? (ixtiyari)
        </label>
        <select
          id="interest"
          name="interest"
          defaultValue=""
          className="w-full px-3 py-2 border rounded-md bg-white"
        >
          <option value="">Hələ qərarsızam</option>
          <option value="MONTHLY">Aylıq</option>
          <option value="QUARTERLY">Rüblük</option>
          <option value="ANNUAL">İllik</option>
        </select>
      </div>

      <div>
        <label htmlFor="message" className="block text-sm font-medium mb-1">
          Qeyd (ixtiyari)
        </label>
        <textarea
          id="message"
          name="message"
          rows={2}
          placeholder="Sual və ya əlavə məlumat"
          className="w-full px-3 py-2 border rounded-md"
        />
      </div>

      {state?.message && !state.ok && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}

      <button type="submit" disabled={pending} className="btn-brand w-full">
        {pending ? "Göndərilir…" : "Müraciəti göndər"}
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
