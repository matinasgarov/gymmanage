"use client";

import { useState } from "react";
import { X, Trash2, AlertTriangle } from "lucide-react";
import { deleteMember } from "@/lib/member-actions";
import { useT } from "@/components/i18n-provider";

export function DeleteMemberDialog({
  memberId,
  memberName,
}: {
  memberId: string;
  memberName: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  // No default: the admin must explicitly answer the payments question so they
  // can't "forget the checkbox" and silently get an outcome they didn't choose.
  const [paymentChoice, setPaymentChoice] = useState<"keep" | "delete" | null>(null);
  const action = deleteMember.bind(null, memberId);

  const matches = typed.trim() === memberName.trim();
  const canSubmit = matches && paymentChoice !== null;

  function close() {
    setOpen(false);
    setTyped("");
    setPaymentChoice(null);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-full text-sm font-medium"
      >
        <Trash2 className="w-3.5 h-3.5" />
        {t("deleteMember.button")}
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={close}
        >
          <div
            className="bg-white rounded-xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold flex items-center gap-2 text-red-700">
                <AlertTriangle className="w-4 h-4" />
                {t("deleteMember.title")}
              </h3>
              <button onClick={close} className="p-1 -mr-1" aria-label={t("common.close")}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-sm text-[var(--muted)] space-y-2 mb-4">
              <p>
                <strong className="text-red-700">{t("deleteMember.irreversible")}</strong>{" "}
                {t("deleteMember.recordsDeleted")}
              </p>
              <p>
                {t("deleteMember.confirmPrompt")}{" "}
                <strong className="text-[var(--foreground)]">{memberName}</strong>
              </p>
            </div>

            <form action={action} className="space-y-3">
              {/* The choice rides along as the radios' value (name="deletePayments"). */}
              <input
                name="confirmName"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={memberName}
                autoComplete="off"
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm"
              />

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-[var(--foreground)] mb-1">
                  {t("deleteMember.paymentsQuestion")}
                </legend>
                <label
                  className={`flex items-start gap-2 text-sm border rounded-md p-2.5 cursor-pointer ${
                    paymentChoice === "keep"
                      ? "border-[var(--brand)] bg-[var(--brand)]/5"
                      : "border-[var(--border)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="deletePayments"
                    value="false"
                    checked={paymentChoice === "keep"}
                    onChange={() => setPaymentChoice("keep")}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    {t("deleteMember.keepPayments")}{" "}
                    <span className="text-[var(--muted)]">{t("deleteMember.keepPaymentsHint")}</span>
                  </span>
                </label>
                <label
                  className={`flex items-start gap-2 text-sm border rounded-md p-2.5 cursor-pointer ${
                    paymentChoice === "delete" ? "border-red-500 bg-red-50" : "border-[var(--border)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="deletePayments"
                    value="true"
                    checked={paymentChoice === "delete"}
                    onChange={() => setPaymentChoice("delete")}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span>
                    {t("deleteMember.deletePaymentsOpt")}{" "}
                    <span className="text-red-700">{t("deleteMember.deletePaymentsHint")}</span>
                  </span>
                </label>
              </fieldset>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={close} className="btn-ghost">
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full px-4 py-2 text-sm font-medium"
                >
                  {t("deleteMember.confirmButton")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
