"use client";

import { useActionState } from "react";
import { resetPassword, type FormState } from "@/lib/auth-actions";

const initial: FormState = undefined;

export function ResetForm({ token }: { token: string }) {
  const action = resetPassword.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="space-y-4 bg-white p-6 rounded-lg shadow-sm border">
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">
          Yeni şifrə
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
        {pending ? "Yenilənir…" : "Şifrəni yenilə"}
      </button>
    </form>
  );
}
