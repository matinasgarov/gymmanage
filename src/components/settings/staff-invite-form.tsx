"use client";

import { useActionState } from "react";
import { inviteStaff, type FormState } from "@/lib/auth-actions";

const initial: FormState = undefined;

export function StaffInviteForm() {
  const [state, action, pending] = useActionState(inviteStaff, initial);

  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="staff-name" className="mb-1 block text-xs text-[var(--muted)]">
            Ad Soyad
          </label>
          <input
            id="staff-name"
            name="name"
            placeholder="Məsələn: Aysel Quliyeva"
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
          />
          {state?.errors?.name?.[0] && (
            <p className="mt-1 text-xs text-red-600">{state.errors.name[0]}</p>
          )}
        </div>
        <div>
          <label htmlFor="staff-email" className="mb-1 block text-xs text-[var(--muted)]">
            Email
          </label>
          <input
            id="staff-email"
            name="email"
            type="email"
            placeholder="email@example.com"
            className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
          />
          {state?.errors?.email?.[0] && (
            <p className="mt-1 text-xs text-red-600">{state.errors.email[0]}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 whitespace-nowrap rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending ? "Göndərilir…" : "Dəvət göndər"}
        </button>
        {state?.message && (
          <p className="text-xs text-emerald-700">{state.message}</p>
        )}
      </div>
    </form>
  );
}
