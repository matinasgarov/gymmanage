"use client";

import { useActionState } from "react";
import { updateGymTemplates, type SettingsState } from "@/lib/settings-actions";
import { DEFAULT_TEMPLATES, TEMPLATE_PLACEHOLDERS, type TemplateKey } from "@/lib/templates";
import { useT } from "@/components/i18n-provider";

const initial: SettingsState = undefined;

const FIELDS: { key: TemplateKey; name: string }[] = [
  { key: "reminder", name: "waReminderTemplate" },
  { key: "receipt", name: "waReceiptTemplate" },
  { key: "expiring", name: "waExpiringTemplate" },
  { key: "welcome", name: "waWelcomeTemplate" },
];

const LABEL_KEY: Record<TemplateKey, string> = {
  reminder: "settings.templateReminder",
  receipt: "settings.templateReceipt",
  expiring: "settings.templateExpiring",
  welcome: "settings.templateWelcome",
};

export function TemplatesForm({ defaults }: { defaults: Record<string, string> }) {
  const t = useT();
  const [state, action, pending] = useActionState(updateGymTemplates, initial);

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {FIELDS.map((f) => (
        <div key={f.key} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label htmlFor={f.name} className="md-field-label">
            {t(LABEL_KEY[f.key])}
          </label>
          <textarea
            id={f.name}
            name={f.name}
            rows={3}
            defaultValue={defaults[f.name]}
            placeholder={DEFAULT_TEMPLATES[f.key]}
            className="md-input"
            style={{ height: "auto", minHeight: 72, padding: "10px 12px", lineHeight: 1.5, resize: "vertical" }}
          />
          <p style={{ fontSize: 11, fontWeight: 500, color: "var(--d-tx3)" }}>
            {t("settings.templatePlaceholders")} {TEMPLATE_PLACEHOLDERS[f.key].join(", ")}
          </p>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="submit" disabled={pending} className="btn-primary" style={{ opacity: pending ? 0.5 : 1 }}>
          {pending ? t("common.saving") : t("settings.saveTemplates")}
        </button>
        {state?.ok && state.message && (
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#10b981" }}>{state.message}</span>
        )}
        {!state?.ok && state?.message && (
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "#ef4444" }}>{state.message}</span>
        )}
      </div>
    </form>
  );
}
