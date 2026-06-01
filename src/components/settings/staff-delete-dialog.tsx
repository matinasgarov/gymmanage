"use client";

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { deleteStaff } from "@/lib/auth-actions";

export function StaffDeleteDialog({
  staffId,
  staffName,
}: {
  staffId: string;
  staffName: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const action = deleteStaff.bind(null, staffId);

  const matches = typed.trim() === staffName.trim();

  function close() {
    setOpen(false);
    setTyped("");
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-red-600 hover:text-red-700 hover:underline"
      >
        Sil
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
                İşçini sil
              </h3>
              <button onClick={close} className="p-1 -mr-1" aria-label="Bağla">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-sm text-[var(--muted)] space-y-2 mb-4">
              <p>
                <strong className="text-[var(--foreground)]">{staffName}</strong>{" "}
                adlı işçinin hesabı{" "}
                <strong className="text-red-700">həmişəlik silinəcək</strong>. Onların
                keçmiş əməliyyatları (ödəniş, giriş qeydləri) saxlanılır, lakin kimin
                etdiyi görünməyəcək.
              </p>
              <p>
                Təsdiq üçün işçinin adını yazın:{" "}
                <strong className="text-[var(--foreground)]">{staffName}</strong>
              </p>
            </div>

            <form action={action} className="space-y-3">
              <input
                name="confirmName"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={staffName}
                autoComplete="off"
                className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={close} className="btn-ghost">
                  Ləğv et
                </button>
                <button
                  type="submit"
                  disabled={!matches}
                  className="bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full px-4 py-2 text-sm font-medium"
                >
                  Həmişəlik sil
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
