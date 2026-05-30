"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cancelMember } from "@/lib/member-actions";

const REASONS: { value: string; label: string }[] = [
  { value: "MOVED", label: "Köçüb / başqa şəhərdə" },
  { value: "PRICE", label: "Qiymət baha gəldi" },
  { value: "INJURY", label: "Zədə / sağlamlıq" },
  { value: "LOST_MOTIVATION", label: "Motivasiya itkisi" },
  { value: "POOR_SERVICE", label: "Xidmətdən narazılıq" },
  { value: "OTHER", label: "Digər" },
];

export function CancelDialog({ memberId }: { memberId: string }) {
  const [open, setOpen] = useState(false);
  const action = cancelMember.bind(null, memberId);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 border border-red-200 text-red-700 rounded-full text-sm hover:bg-red-50"
      >
        Üzvlüyü ləğv et
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
              <h3 className="font-semibold">Üzvlüyü ləğv et</h3>
              <button
                onClick={() => setOpen(false)}
                className="p-1 -mr-1"
                aria-label="Bağla"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-[var(--muted)] mb-4">
              Səbəbi seçin — bu məlumat zalın gələcək qərarlarına kömək edəcək.
            </p>
            <form action={action} className="space-y-3">
              <div className="space-y-2">
                {REASONS.map((r, i) => (
                  <label
                    key={r.value}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={r.value}
                      defaultChecked={i === 0}
                      required
                    />
                    {r.label}
                  </label>
                ))}
              </div>
              <textarea
                name="note"
                rows={2}
                placeholder="Əlavə qeyd (ixtiyari)"
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-ghost"
                >
                  Geri
                </button>
                <button
                  type="submit"
                  className="bg-red-600 hover:bg-red-700 text-white rounded-full px-4 py-2 text-sm font-medium"
                >
                  Ləğv et
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
