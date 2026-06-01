"use client";

import { useActionState } from "react";
import { acceptInvite, type FormState } from "@/lib/auth-actions";

const initial: FormState = undefined;

export function AcceptForm({ token }: { token: string }) {
  const action = acceptInvite.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="space-y-4 bg-white p-6 rounded-lg shadow-sm border">
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">
          Şifrə təyin edin
        </label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="Ən az 8 simvol"
          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-black/20"
        />
        {state?.errors?.password?.[0] && (
          <p className="text-xs text-red-600 mt-1">{state.errors.password[0]}</p>
        )}
      </div>
      {state?.message && <p className="text-sm text-red-600">{state.message}</p>}
      <button type="submit" disabled={pending} className="btn-brand w-full">
        {pending ? "Hazırlanır…" : "Hesabı aktivləşdir"}
      </button>
    </form>
  );
}
