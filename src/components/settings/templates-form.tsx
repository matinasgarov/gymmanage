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
    <form action={action} className="space-y-4">
      {FIELDS.map((f) => (
        <div key={f.key}>
          <label htmlFor={f.name} className="block text-sm font-medium mb-1">
            {t(LABEL_KEY[f.key])}
          </label>
          <textarea
            id={f.name}
            name={f.name}
            rows={3}
            defaultValue={defaults[f.name]}
            placeholder={DEFAULT_TEMPLATES[f.key]}
            className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm"
          />
          <p className="text-[11px] text-[var(--muted)] mt-1">
            {t("settings.templatePlaceholders")} {TEMPLATE_PLACEHOLDERS[f.key].join(", ")}
          </p>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-brand">
          {pending ? t("common.saving") : t("settings.saveTemplates")}
        </button>
        {state?.ok && state.message && (
          <span className="text-xs text-emerald-700">{state.message}</span>
        )}
        {!state?.ok && state?.message && (
          <span className="text-xs text-red-600">{state.message}</span>
        )}
      </div>
    </form>
  );
}
