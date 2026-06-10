"use client";

import { useState, useTransition } from "react";
import { Target, X, Pencil } from "lucide-react";
import { setMonthlyGoal, type SettingsState } from "@/lib/settings-actions";
import { useT, useLocale } from "@/components/i18n-provider";

export function MonthlyGoalProgress({
  goal,
  current,
  variant = "compact",
}: {
  goal: number | null;
  current: number;
  variant?: "compact" | "hero";
}) {
  const t = useT();
  const locale = useLocale();
  const fmtAzn = (n: number) =>
    n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Hero figures drop the cents — on a monthly headline, decimals are noise.
  const fmtAznHero = (n: number) => Math.round(n).toLocaleString(locale);

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

  const modal = open ? (
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
            {t("goal.title")}
          </h3>
          <button onClick={() => setOpen(false)} className="-mr-1 p-1" aria-label={t("common.close")}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-3 text-xs text-[var(--muted)]">
          {t("goal.help")}
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
                placeholder={t("goal.placeholder")}
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
                {t("goal.remove")}
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {pending ? t("goal.saving") : t("goal.save")}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  // Hero variant: a large revenue figure is the focal point; the goal bar sits
  // beneath it. Used in the dashboard's top hero band.
  if (variant === "hero") {
    return (
      <div>
        <div className="text-4xl font-semibold tracking-tight">
          {fmtAznHero(current)} <span className="text-2xl font-normal text-[var(--muted)]">₼</span>
        </div>
        {goal == null ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-3 py-2 text-xs text-[var(--muted)] hover:border-[var(--brand)] hover:text-[var(--brand-strong)]"
          >
            <Target className="h-3.5 w-3.5" />
            {t("goal.set")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group mt-3 block w-full text-left"
            aria-label={t("goal.change")}
          >
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${reached ? "bg-[var(--signal-ok)]" : "bg-[var(--brand)]"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-xs text-[var(--muted)]">
              <span className="flex items-center gap-1">
                {t("goal.target")}: {fmtAznHero(goal)} ₼
                <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
              <span>{pct.toFixed(0)}%</span>
            </div>
            {reached && (
              <p className="mt-1 text-[11px] font-medium text-[var(--signal-ok)]">
                {t("goal.reached")}
              </p>
            )}
          </button>
        )}
        {modal}
      </div>
    );
  }

  return (
    <div>
      {goal == null ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] px-3 py-2.5 text-sm text-[var(--muted)] hover:border-[var(--brand)] hover:text-[var(--brand-strong)]"
        >
          <Target className="h-4 w-4" />
          {t("goal.set")}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group w-full text-left"
          aria-label={t("goal.change")}
        >
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium">
              {t("goal.thisMonth")}
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
            <p className="mt-1 text-[11px] font-medium text-emerald-600">{t("goal.reached")}</p>
          )}
        </button>
      )}

      {modal}
    </div>
  );
}
