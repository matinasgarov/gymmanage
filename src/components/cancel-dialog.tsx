"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cancelMember } from "@/lib/member-actions";
import { useT } from "@/components/i18n-provider";

const REASON_VALUES = ["MOVED", "PRICE", "INJURY", "LOST_MOTIVATION", "POOR_SERVICE", "OTHER"];

export function CancelDialog({ memberId }: { memberId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const action = cancelMember.bind(null, memberId);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 border border-red-200 text-red-700 rounded-full text-sm hover:bg-red-50"
      >
        {t("cancel.button")}
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">{t("cancel.title")}</h3>
              <button
                onClick={() => setOpen(false)}
                className="p-1 -mr-1"
                aria-label={t("common.close")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-[var(--muted)] mb-4">
              {t("cancel.help")}
            </p>
            <form action={action} className="space-y-3">
              <div className="space-y-2">
                {REASON_VALUES.map((value, i) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={value}
                      defaultChecked={i === 0}
                      required
                    />
                    {t(`cancel.reason${value}`)}
                  </label>
                ))}
              </div>
              <textarea
                name="note"
                rows={2}
                placeholder={t("cancel.notePlaceholder")}
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-ghost"
                >
                  {t("common.back")}
                </button>
                <button
                  type="submit"
                  className="bg-red-600 hover:bg-red-700 text-white rounded-full px-4 py-2 text-sm font-medium"
                >
                  {t("cancel.submit")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
