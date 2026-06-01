"use client";

import { useActionState } from "react";
import { inviteStaff, type FormState } from "@/lib/auth-actions";

const initial: FormState = undefined;

export function StaffInviteForm() {
  const [state, action, pending] = useActionState(inviteStaff, initial);

  return (
    <form action={action} className="flex flex-col sm:flex-row gap-2 sm:items-start">
      <div className="flex-1">
        <input
          name="name"
          placeholder="Ad Soyad"
          className="w-full px-3 py-2 border rounded-md text-sm"
        />
        {state?.errors?.name?.[0] && (
          <p className="text-xs text-red-600 mt-1">{state.errors.name[0]}</p>
        )}
      </div>
      <div className="flex-1">
        <input
          name="email"
          type="email"
          placeholder="email@example.com"
          className="w-full px-3 py-2 border rounded-md text-sm"
        />
        {state?.errors?.email?.[0] && (
          <p className="text-xs text-red-600 mt-1">{state.errors.email[0]}</p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="bg-black text-white rounded-full px-4 py-2 text-sm font-medium disabled:opacity-40"
      >
        {pending ? "Göndərilir…" : "İşçi əlavə et"}
      </button>
      {state?.message && (
        <p className="text-xs text-emerald-700 mt-2 sm:basis-full">{state.message}</p>
      )}
    </form>
  );
}
