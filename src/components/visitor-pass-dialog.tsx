"use client";

import { useActionState, useState } from "react";
import { X, Copy, ExternalLink, MessageCircle } from "lucide-react";
import {
  recordQuickVisit,
  issueDayPass,
  type VisitorFormState,
} from "@/lib/visitor-actions";
import { useT } from "@/components/i18n-provider";

const initial: VisitorFormState = undefined;

export function VisitorPassDialog({
  mode,
  open,
  onClose,
}: {
  mode: "quick" | "daypass";
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const action = mode === "quick" ? recordQuickVisit : issueDayPass;
  const [state, formAction, pending] = useActionState(action, initial);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const isSuccess = state?.ok;

  const close = () => {
    setCopied(false);
    onClose();
  };

  const fullUrl =
    state?.passUrl && typeof window !== "undefined"
      ? `${window.location.origin}${state.passUrl}`
      : state?.passUrl ?? "";

  const waUrl = fullUrl
    ? `https://wa.me/?text=${encodeURIComponent(t("scan.waPassMessage", { url: fullUrl }))}`
    : "";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={close}
    >
      <div
        className="bg-white rounded-xl w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">
            {mode === "quick" ? t("scan.quickEntry") : t("scan.daypassCreate")}
          </h3>
          <button onClick={close} className="p-1 -mr-1" aria-label={t("common.close")}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {!isSuccess ? (
          <form action={formAction} className="space-y-3">
            <Field
              label={t("scan.amount")}
              name="amount"
              type="number"
              step="0.01"
              defaultValue="15"
              errors={state?.errors?.amount}
            />
            <div>
              <label htmlFor="method" className="block text-sm font-medium mb-1">
                {t("scan.payMethod")}
              </label>
              <select
                id="method"
                name="method"
                defaultValue="CASH"
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-white text-sm"
              >
                <option value="CASH">{t("method.CASH")}</option>
                <option value="CARD">{t("method.CARD")}</option>
                <option value="TRANSFER">{t("method.TRANSFER")}</option>
              </select>
            </div>
            <Field
              label={t("scan.guestName")}
              name="name"
              placeholder={t("scan.guestNamePlaceholder")}
              errors={state?.errors?.name}
            />
            <Field
              label={t("scan.guestPhone")}
              name="phone"
              type="tel"
              placeholder="+994501234567"
              errors={state?.errors?.phone}
            />

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={close} className="btn-ghost">
                {t("scan.back")}
              </button>
              <button type="submit" disabled={pending} className="btn-brand">
                {pending
                  ? t("common.saving")
                  : mode === "quick"
                    ? t("scan.submit")
                    : t("scan.submitDaypass")}
              </button>
            </div>
          </form>
        ) : mode === "quick" ? (
          <SuccessOk message={state?.message ?? ""} onClose={close} />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-emerald-700">{state?.message}</p>
            <code className="block text-xs text-[var(--brand-strong)] break-all p-3 bg-[var(--background)] rounded">
              {fullUrl}
            </code>
            <div className="flex flex-wrap gap-2">
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-3 py-1.5 text-sm font-medium"
              >
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </a>
              <a
                href={fullUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" /> {t("scan.open")}
              </a>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(fullUrl);
                  setCopied(true);
                }}
                className="btn-ghost inline-flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" /> {copied ? t("scan.copied") : t("scan.copy")}
              </button>
            </div>
            <div className="flex justify-end pt-2">
              <button type="button" onClick={close} className="btn-brand">
                {t("scan.finish")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SuccessOk({ message, onClose }: { message: string; onClose: () => void }) {
  const t = useT();
  return (
    <div className="text-center py-6">
      <div className="text-4xl mb-2">✓</div>
      <p className="text-sm text-emerald-700 mb-4">{message}</p>
      <button onClick={onClose} className="btn-brand">
        {t("common.close")}
      </button>
    </div>
  );
}

function Field(props: {
  label: string;
  name: string;
  type?: string;
  step?: string;
  defaultValue?: string;
  placeholder?: string;
  errors?: string[];
}) {
  return (
    <div>
      <label htmlFor={props.name} className="block text-sm font-medium mb-1">
        {props.label}
      </label>
      <input
        id={props.name}
        name={props.name}
        type={props.type ?? "text"}
        step={props.step}
        defaultValue={props.defaultValue}
        placeholder={props.placeholder}
        className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm"
      />
      {props.errors?.[0] && (
        <p className="text-xs text-red-600 mt-1">{props.errors[0]}</p>
      )}
    </div>
  );
}
