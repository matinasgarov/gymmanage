"use client";

import { useActionState } from "react";
import { login, type FormState } from "@/lib/auth-actions";

const initial: FormState = undefined;

export function LoginForm() {
  const [state, action, pending] = useActionState(login, initial);

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
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">
          Şifrə
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-black/20"
        />
        {state?.errors?.password?.[0] && (
          <p className="text-xs text-red-600 mt-1">{state.errors.password[0]}</p>
        )}
      </div>
      {state?.message && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="btn-brand w-full"
      >
        {pending ? "Yoxlanılır…" : "Daxil ol"}
      </button>
    </form>
  );
}
