"use client";

import { useActionState } from "react";
import { requestPasswordReset, type FormState } from "@/lib/auth-actions";

const initial: FormState = undefined;

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  if (state?.message) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <p className="text-sm text-neutral-700">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4 bg-white p-6 rounded-lg shadow-sm border">
      <div>
        <label htmlFor="email" className="block text-sm font-medium mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="siz@example.com"
          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-black/20"
        />
        {state?.errors?.email?.[0] && (
          <p className="text-xs text-red-600 mt-1">{state.errors.email[0]}</p>
        )}
      </div>
      <button type="submit" disabled={pending} className="btn-brand w-full">
        {pending ? "Göndərilir…" : "Sıfırlama linki göndər"}
      </button>
    </form>
  );
}
