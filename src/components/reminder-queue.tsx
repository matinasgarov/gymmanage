"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Clock,
  CalendarDays,
  MessageCircle,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { recordReminderSent } from "@/lib/reminder-actions";
import { buildWaUrl, pickTemplate, renderTemplate } from "@/lib/templates";
import { useT } from "@/components/i18n-provider";

export type ReminderItem = {
  group: "overdue" | "dueNow" | "expiring";
  paymentId?: string;
  period?: string;
  amount?: number;
  daysLate?: number;
  daysLeft?: number;
  expiryDate?: string;
  member: { id: string; name: string; phone: string; publicId: string };
};

type GroupConfig = {
  key: "overdue" | "dueNow" | "expiring";
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  badgeCls: string;
  subtitleKey: string;
  emptyKey: string;
};

const GROUP_CONFIGS: GroupConfig[] = [
  {
    key: "overdue",
    icon: AlertCircle,
    iconColor: "#ef4444",
    iconBg: "rgba(239,68,68,.1)",
    badgeCls: "danger",
    subtitleKey: "reminders.subOverdue",
    emptyKey: "reminders.emptyOverdue",
  },
  {
    key: "dueNow",
    icon: Clock,
    iconColor: "#f59e0b",
    iconBg: "rgba(245,158,11,.12)",
    badgeCls: "warn",
    subtitleKey: "reminders.subDueNow",
    emptyKey: "reminders.emptyDueNow",
  },
  {
    key: "expiring",
    icon: CalendarDays,
    iconColor: "#06b6d4",
    iconBg: "rgba(6,182,212,.15)",
    badgeCls: "muted",
    subtitleKey: "reminders.subExpiring",
    emptyKey: "reminders.emptyExpiring",
  },
];

const BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  danger: { bg: "rgba(239,68,68,.1)",   color: "#ef4444" },
  warn:   { bg: "rgba(245,158,11,.12)", color: "#f59e0b" },
  muted:  { bg: "var(--d-bg)",          color: "var(--d-tx3)" },
};

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

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
  // Track which paymentIds (or member ids for expiring) have been actioned
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  if (items.length === 0) {
    return (
      <div
        style={{
          background: "white", borderRadius: 16, padding: "48px 20px",
          boxShadow: "var(--d-sh1)", textAlign: "center",
        }}
      >
        <CheckCircle2 style={{ width: 40, height: 40, color: "#10b981", margin: "0 auto 12px" }} />
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--d-tx)", marginBottom: 4 }}>
          {t("reminders.allClear")}
        </div>
        <p style={{ fontSize: 12.5, color: "var(--d-tx3)" }}>{t("reminders.allClearSub")}</p>
      </div>
    );
  }

  const dismiss = (key: string) =>
    setDismissed((prev) => new Set([...prev, key]));

  const buildWa = (item: ReminderItem): string => {
    if (item.group === "expiring") {
      const tmpl = pickTemplate("expiring", expiringTemplate);
      const msg = renderTemplate(tmpl, {
        memberName: item.member.name,
        gymName,
        daysLeft: item.daysLeft ?? 0,
        expiryDate: item.expiryDate ?? "",
      });
      return buildWaUrl(item.member.phone, msg);
    }
    const tmpl = pickTemplate("reminder", reminderTemplate);
    const msg = renderTemplate(tmpl, {
      memberName: item.member.name,
      gymName,
      period: item.period ?? "",
      amount: `${(item.amount ?? 0).toFixed(2)}₼`,
    });
    return buildWaUrl(item.member.phone, msg);
  };

  const itemKey = (item: ReminderItem) =>
    item.paymentId ?? `${item.group}-${item.member.id}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Summary bar */}
      {summary.amount > 0 && (
        <div
          style={{
            background: "white", borderRadius: 16, padding: "14px 20px",
            boxShadow: "var(--d-sh1)", display: "flex", alignItems: "center",
            justifyContent: "space-between", gap: 12,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--d-tx)" }}>
            {t("reminders.summaryTitle")}
          </span>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--d-tx)" }}>
            {t("reminders.summaryValue", {
              amount: summary.amount.toFixed(2),
              people: summary.people,
            })}
          </span>
        </div>
      )}

      {GROUP_CONFIGS.map((cfg) => {
        const groupItems = items
          .filter((i) => i.group === cfg.key && !dismissed.has(itemKey(i)));
        const Icon = cfg.icon;

        return (
          <div
            key={cfg.key}
            style={{
              background: "white", borderRadius: 16,
              boxShadow: "var(--d-sh1)", overflow: "hidden",
            }}
          >
            {/* Section header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, padding: "20px 24px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: cfg.iconBg, color: cfg.iconColor, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon style={{ width: 16, height: 16 }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: "var(--d-tx)", letterSpacing: "-0.3px" }}>
                    {t(`reminders.group.${cfg.key}`)}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--d-tx3)" }}>
                    {t(cfg.subtitleKey)}
                  </span>
                </div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--d-tx3)", whiteSpace: "nowrap", paddingTop: 2 }}>
                <b style={{ color: "var(--d-tx)" }}>{groupItems.length}</b> {t("reminders.persons")}
              </span>
            </div>

            {/* Section body */}
            <div style={{ padding: "14px 24px 20px" }}>
              {groupItems.length === 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--d-tx3)", padding: "6px 0 2px" }}>
                  {t(cfg.emptyKey)} <span style={{ fontSize: 15 }}>🎉</span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {groupItems.map((item, i) => {
                    const badge = BADGE_STYLES[cfg.badgeCls];
                    const waUrl = buildWa(item);
                    const key = itemKey(item);
                    const detail =
                      item.group === "expiring"
                        ? `${t("reminders.statExpiry")}: ${item.expiryDate ?? ""} · ${t("reminders.statDaysLeft")}: ${t("units.days", { count: item.daysLeft ?? 0 })}`
                        : `${t("reminders.statPeriod")}: ${item.period ?? ""} · ${(item.amount ?? 0).toFixed(2)}₼ · ${t("units.days", { count: item.daysLate ?? 0 })}`;

                    return (
                      <div
                        key={key}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "10px 0",
                          borderBottom: i < groupItems.length - 1 ? "1px solid var(--d-bdr)" : "none",
                        }}
                      >
                        {/* Avatar */}
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(59,123,246,.12)", color: "#3b7bf6", fontWeight: 800, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {initials(item.member.name)}
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                          <Link
                            href={`/members/${item.member.id}`}
                            style={{ fontSize: 13.5, fontWeight: 700, color: "var(--d-tx)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: "none" }}
                          >
                            {item.member.name}
                          </Link>
                          <div style={{ fontSize: 11.5, color: "var(--d-tx3)", fontWeight: 500 }}>
                            {detail}
                          </div>
                        </div>

                        {/* Badge */}
                        <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 9px", borderRadius: 6, whiteSpace: "nowrap", flexShrink: 0, background: badge.bg, color: badge.color }}>
                          {item.group === "overdue"
                            ? t("reminders.badgeOverdue")
                            : item.group === "dueNow"
                            ? t("reminders.badgeDueNow")
                            : t("reminders.badgeExpiring")}
                        </span>

                        {/* WA button */}
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => {
                            if (item.paymentId) void recordReminderSent(item.paymentId, "whatsapp");
                            dismiss(key);
                          }}
                          style={{
                            width: 30, height: 30, borderRadius: 8,
                            border: "1px solid var(--d-bdr)",
                            background: "var(--d-bg)", color: "var(--d-tx3)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0, textDecoration: "none", transition: "background .15s, color .15s, border-color .15s",
                          }}
                          title={t("reminders.sendWhatsapp")}
                          className="reminder-wa-btn"
                        >
                          <MessageCircle style={{ width: 13, height: 13 }} />
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
