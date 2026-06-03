"use client";

import { useState, useTransition } from "react";
import { Target, X, Pencil } from "lucide-react";
import { setMonthlyGoal, type SettingsState } from "@/lib/settings-actions";

function fmtAzn(n: number): string {
  return n.toLocaleString("az", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function MonthlyGoalProgress({
  goal,
  current,
}: {
  goal: number | null;
  current: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SettingsState>(undefined);
  const [pending, startTransition] = useTransition();

  // Run the server action inside a transition; close the modal on success.
  // (Closing here, in the submit handler, avoids a setState-in-effect.)
  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await setMonthlyGoal(undefined, formData);
      setState(result);
      if (result?.ok) setOpen(false);
    });
  }

  function clear() {
    const fd = new FormData();
    fd.set("goal", "");
    submit(fd);
  }

  const pct = goal && goal > 0 ? Math.min(100, (current / goal) * 100) : 0;
  const reached = goal != null && goal > 0 && current >= goal;

  return (
    <div className="mb-4 border-b border-[var(--border)] pb-4">
      {goal == null ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-3 py-2.5 text-sm text-[var(--muted)] hover:border-[var(--brand)] hover:text-[var(--brand-strong)]"
        >
          <Target className="h-4 w-4" />
          Aylıq gəlir hədəfi təyin et
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group w-full text-left"
          aria-label="Hədəfi dəyiş"
        >
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium">
              <Target className="h-3.5 w-3.5 text-[var(--brand-strong)]" />
              Aylıq hədəf
              <Pencil className="h-3 w-3 text-[var(--muted)] opacity-0 transition-opacity group-hover:opacity-100" />
            </span>
            <span className="text-[var(--muted)]">
              {fmtAzn(current)} / {fmtAzn(goal)} ₼ · {pct.toFixed(0)}%
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${reached ? "bg-emerald-500" : "bg-[var(--brand)]"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {reached && (
            <p className="mt-1 text-[11px] font-medium text-emerald-600">Hədəfə çatdınız! 🎉</p>
          )}
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-semibold">
                <Target className="h-4 w-4 text-[var(--brand-strong)]" />
                Aylıq gəlir hədəfi
              </h3>
              <button onClick={() => setOpen(false)} className="-mr-1 p-1" aria-label="Bağla">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-3 text-xs text-[var(--muted)]">
              Hər ay üçün gəlir hədəfinizi təyin edin. İrəliləyiş hər ay yenidən başlayır.
            </p>

            <form action={submit} className="space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <input
                    name="goal"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="decimal"
                    defaultValue={goal ?? ""}
                    placeholder="Məsələn: 5000"
                    autoFocus
                    className="w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
                  />
                  <span className="text-sm text-[var(--muted)]">₼</span>
                </div>
                {state?.errors?.goal?.[0] && (
                  <p className="mt-1 text-xs text-red-600">{state.errors.goal[0]}</p>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                {goal != null ? (
                  <button
                    type="button"
                    onClick={clear}
                    disabled={pending}
                    className="text-xs text-red-600 hover:underline disabled:opacity-40"
                  >
                    Hədəfi sil
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
                    Ləğv et
                  </button>
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                  >
                    {pending ? "Yadda saxlanılır…" : "Yadda saxla"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
