"use client";

import { useActionState } from "react";
import { inviteStaff, type FormState } from "@/lib/auth-actions";
import { useT } from "@/components/i18n-provider";

const initial: FormState = undefined;

export function StaffInviteForm() {
  const t = useT();
  const [state, action, pending] = useActionState(inviteStaff, initial);

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="staff-name" className="md-field-label">
            {t("settings.staffInviteName")}
          </label>
          <input
            id="staff-name"
            name="name"
            placeholder={t("settings.staffInviteNamePlaceholder")}
            className="md-input"
          />
          {state?.errors?.name?.[0] && (
            <p style={{ fontSize: 11.5, fontWeight: 600, color: "#ef4444" }}>{state.errors.name[0]}</p>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor="staff-email" className="md-field-label">
            Email
          </label>
          <input
            id="staff-email"
            name="email"
            type="email"
            placeholder="email@example.com"
            className="md-input"
          />
          {state?.errors?.email?.[0] && (
            <p style={{ fontSize: 11.5, fontWeight: 600, color: "#ef4444" }}>{state.errors.email[0]}</p>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="submit"
          disabled={pending}
          className="btn-primary"
          style={{ opacity: pending ? 0.5 : 1 }}
        >
          {pending ? t("settings.staffInviteSending") : t("settings.staffInviteSubmit")}
        </button>
        {state?.message && (
          <p style={{ fontSize: 12.5, fontWeight: 600, color: "#10b981" }}>{state.message}</p>
        )}
      </div>
    </form>
  );
}
