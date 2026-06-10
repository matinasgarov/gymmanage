"use client";

import { useActionState } from "react";
import { resetPassword, type FormState } from "@/lib/auth-actions";
import { useT } from "@/components/i18n-provider";

const initial: FormState = undefined;

export function ResetForm({ token }: { token: string }) {
  const t = useT();
  const action = resetPassword.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <form action={formAction} className="space-y-4 bg-white p-6 rounded-lg shadow-sm border">
      <div>
        <label htmlFor="password" className="block text-sm font-medium mb-1">
          {t("auth.resetNewPassword")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder={t("auth.signupPasswordPlaceholder")}
          className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-black/20"
        />
        {state?.errors?.password?.[0] && (
          <p className="text-xs text-red-600 mt-1">{state.errors.password[0]}</p>
        )}
      </div>
      {state?.message && <p className="text-sm text-red-600">{state.message}</p>}
      <button type="submit" disabled={pending} className="btn-brand w-full">
        {pending ? t("auth.resetUpdating") : t("auth.resetSubmit")}
      </button>
    </form>
  );
}
