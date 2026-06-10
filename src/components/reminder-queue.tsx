"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, MessageCircle, SkipForward, ExternalLink } from "lucide-react";
import { recordReminderSent } from "@/lib/reminder-actions";
import { buildWaUrl, pickTemplate, renderTemplate } from "@/lib/templates";
import { useT } from "@/components/i18n-provider";

export type ReminderItem = {
  group: "overdue" | "dueNow" | "expiring";
  // payment groups (overdue / dueNow)
  paymentId?: string;
  period?: string;
  amount?: number;
  daysLate?: number;
  // expiring group
  daysLeft?: number;
  expiryDate?: string;
  member: { id: string; name: string; phone: string; publicId: string };
};

export function ReminderQueue({
  items,
  gymName,
  reminderTemplate,
  expiringTemplate,
  summary,
}: {
  items: ReminderItem[];
  gymName: string;
  reminderTemplate: string | null;
  expiringTemplate: string | null;
  summary: { amount: number; people: number };
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
    if (current.group === "expiring") {
      const tmpl = pickTemplate("expiring", expiringTemplate);
      const msg = renderTemplate(tmpl, {
        memberName: current.member.name,
        gymName,
        daysLeft: current.daysLeft ?? 0,
        expiryDate: current.expiryDate ?? "",
      });
      return buildWaUrl(current.member.phone, msg);
    }
    const tmpl = pickTemplate("reminder", reminderTemplate);
    const msg = renderTemplate(tmpl, {
      memberName: current.member.name,
      gymName,
      period: current.period ?? "",
      amount: `${(current.amount ?? 0).toFixed(2)}₼`,
    });
    return buildWaUrl(current.member.phone, msg);
  }, [current, gymName, reminderTemplate, expiringTemplate]);

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
    if (current.paymentId) void recordReminderSent(current.paymentId, "whatsapp");
    setSentCount((n) => n + 1);
    setIndex((i) => i + 1);
  };
  const onSkip = async () => {
    if (current.paymentId) void recordReminderSent(current.paymentId, "skip");
    setSkippedCount((n) => n + 1);
    setIndex((i) => i + 1);
  };

  const progressPct = (index / total) * 100;

  return (
    <div className="max-w-md mx-auto space-y-4">
      {summary.amount > 0 && (
        <div className="card px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-medium">{t("reminders.summaryTitle")}</span>
          <span className="text-sm font-semibold">
            {t("reminders.summaryValue", {
              amount: summary.amount.toFixed(2),
              people: summary.people,
            })}
          </span>
        </div>
      )}

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
        <span
          className={`inline-block text-[11px] px-2 py-0.5 rounded-full mb-3 ${
            current.group === "overdue"
              ? "bg-red-50 text-red-700"
              : current.group === "dueNow"
                ? "bg-amber-50 text-amber-700"
                : "bg-blue-50 text-blue-700"
          }`}
        >
          {t(`reminders.group.${current.group}`)}
        </span>

        <div className="w-16 h-16 mx-auto rounded-full bg-[var(--brand-soft)] text-[var(--brand-strong)] flex items-center justify-center text-2xl font-semibold mb-3">
          {current.member.name.slice(0, 1).toUpperCase()}
        </div>
        <h2 className="text-lg font-semibold">{current.member.name}</h2>
        <p className="text-xs text-[var(--muted)]">
          {current.member.publicId} · {current.member.phone}
        </p>

        {current.group === "expiring" ? (
          <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
            <Stat label={t("reminders.statExpiry")} value={current.expiryDate ?? ""} />
            <Stat
              label={t("reminders.statDaysLeft")}
              value={t("units.days", { count: current.daysLeft ?? 0 })}
            />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 mt-4 text-sm">
            <Stat label={t("reminders.statPeriod")} value={current.period ?? ""} />
            <Stat
              label={t("reminders.statAmount")}
              value={`${(current.amount ?? 0).toFixed(2)}₼`}
            />
            <Stat
              label={t("reminders.statDelay")}
              value={t("units.days", { count: current.daysLate ?? 0 })}
            />
          </div>
        )}

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
