"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, MessageCircle, SkipForward, ExternalLink } from "lucide-react";
import { recordReminderSent } from "@/lib/reminder-actions";
import { buildWaUrl, pickTemplate, renderTemplate } from "@/lib/templates";
import { useT } from "@/components/i18n-provider";

export type ReminderItem = {
  paymentId: string;
  period: string;
  amount: number;
  daysLate: number;
  member: { id: string; name: string; phone: string; publicId: string };
};

export function ReminderQueue({
  items,
  gymName,
  reminderTemplate,
}: {
  items: ReminderItem[];
  gymName: string;
  reminderTemplate: string | null;
}) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

  const current = items[index];
  const remaining = items.length - index;
  const total = items.length;

  const waUrl = useMemo(() => {
    if (!current) return "";
    const tmpl = pickTemplate("reminder", reminderTemplate);
    const msg = renderTemplate(tmpl, {
      memberName: current.member.name,
      gymName,
      period: current.period,
      amount: `${current.amount.toFixed(2)}₼`,
    });
    return buildWaUrl(current.member.phone, msg);
  }, [current, gymName, reminderTemplate]);

  if (total === 0) {
    return (
      <div className="card p-10 text-center max-w-md mx-auto">
        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
        <h2 className="font-semibold mb-1">{t("reminders.allClear")}</h2>
        <p className="text-sm text-[var(--muted)]">{t("reminders.allClearSub")}</p>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="card p-10 text-center max-w-md mx-auto">
        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
        <h2 className="font-semibold mb-1">{t("reminders.allDone")}</h2>
        <p className="text-sm text-[var(--muted)]">
          {t("reminders.allDoneSub", { sent: sentCount, skipped: skippedCount })}
        </p>
        <button
          onClick={() => {
            setIndex(0);
            setSentCount(0);
            setSkippedCount(0);
          }}
          className="btn-ghost mt-4"
        >
          {t("reminders.restart")}
        </button>
      </div>
    );
  }

  const onSent = async () => {
    void recordReminderSent(current.paymentId, "whatsapp");
    setSentCount((n) => n + 1);
    setIndex((i) => i + 1);
  };
  const onSkip = async () => {
    void recordReminderSent(current.paymentId, "skip");
    setSkippedCount((n) => n + 1);
    setIndex((i) => i + 1);
  };

  const progressPct = (index / total) * 100;

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div>
        <div className="flex items-center justify-between text-xs text-[var(--muted)] mb-1.5">
          <span>
            {index + 1} / {total}
          </span>
          <span>
            ✓ {sentCount} · ⤴ {skippedCount} · {t("reminders.remaining", { count: remaining })}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
          <div
            className="h-full bg-[var(--brand)] transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="card p-6 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-[var(--brand-soft)] text-[var(--brand-strong)] flex items-center justify-center text-2xl font-semibold mb-3">
          {current.member.name.slice(0, 1).toUpperCase()}
        </div>
        <h2 className="text-lg font-semibold">{current.member.name}</h2>
        <p className="text-xs text-[var(--muted)]">
          {current.member.publicId} · {current.member.phone}
        </p>

        <div className="grid grid-cols-3 gap-2 mt-4 text-sm">
          <Stat label={t("reminders.statPeriod")} value={current.period} />
          <Stat label={t("reminders.statAmount")} value={`${current.amount.toFixed(2)}₼`} />
          <Stat
            label={t("reminders.statDelay")}
            value={t("units.days", { count: current.daysLate })}
          />
        </div>

        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onSent}
          className="mt-5 inline-flex items-center justify-center gap-2 w-full bg-emerald-500 hover:bg-emerald-600 text-white rounded-full py-3 font-semibold"
        >
          <MessageCircle className="w-4 h-4" />
          {t("reminders.sendWhatsapp")}
        </a>

        <div className="grid grid-cols-2 gap-2 mt-2">
          <button
            onClick={onSkip}
            className="btn-ghost inline-flex items-center justify-center gap-1.5"
          >
            <SkipForward className="w-3.5 h-3.5" />
            {t("reminders.skip")}
          </button>
          <Link
            href={`/members/${current.member.id}`}
            target="_blank"
            className="btn-ghost inline-flex items-center justify-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {t("reminders.viewProfile")}
          </Link>
        </div>

        <p className="text-[11px] text-[var(--muted)] mt-3">{t("reminders.advanceHint")}</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--background)] rounded-lg py-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="font-medium text-sm">{value}</div>
    </div>
  );
}
