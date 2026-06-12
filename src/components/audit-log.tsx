"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  FileText,
  CreditCard,
  Users,
  LayoutGrid,
  Settings,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useT } from "@/components/i18n-provider";
import type { AuditCategory } from "@/lib/audit";

export type AuditRow = {
  id: string;
  action: string;
  time: string;
  actor: string;
  category: AuditCategory;
  detail?: string;
  href?: string | null;
};

type CatStyle = { color: string; bg: string; icon: LucideIcon; badgeKey: string };

const CAT: Record<AuditCategory, CatStyle> = {
  payment:       { color: "#10b981", bg: "rgba(16,185,129,.12)", icon: CreditCard, badgeKey: "audit.badgePayment" },
  member:        { color: "#3b7bf6", bg: "rgba(59,123,246,.12)", icon: Users,      badgeKey: "audit.badgeMember" },
  scannerdevice: { color: "#f59e0b", bg: "rgba(245,158,11,.12)", icon: LayoutGrid, badgeKey: "audit.badgeDevice" },
  gym:           { color: "#8b5cf6", bg: "rgba(139,92,246,.1)",  icon: Settings,   badgeKey: "audit.badgeGym" },
  guest:         { color: "#06b6d4", bg: "rgba(6,182,212,.15)",  icon: UserPlus,   badgeKey: "audit.badgeGuest" },
};

const STAT_CARDS: {
  category: AuditCategory | "all";
  accent: string;
  iconBg: string;
  iconColor: string;
  icon: LucideIcon;
  labelKey: string;
  hintKey: string;
}[] = [
  { category: "all",           accent: "#3b7bf6", iconBg: "rgba(59,123,246,.12)", iconColor: "#3b7bf6", icon: FileText,   labelKey: "audit.statTotalLabel",   hintKey: "audit.statTotalHint" },
  { category: "payment",       accent: "#10b981", iconBg: "rgba(16,185,129,.12)", iconColor: "#10b981", icon: CreditCard, labelKey: "audit.statPaymentLabel", hintKey: "audit.statPaymentHint" },
  { category: "member",        accent: "#06b6d4", iconBg: "rgba(6,182,212,.15)",  iconColor: "#06b6d4", icon: Users,      labelKey: "audit.statMemberLabel",  hintKey: "audit.statMemberHint" },
  { category: "scannerdevice", accent: "#f59e0b", iconBg: "rgba(245,158,11,.12)", iconColor: "#f59e0b", icon: LayoutGrid, labelKey: "audit.statDeviceLabel",  hintKey: "audit.statDeviceHint" },
];

const TABS: { value: AuditCategory | "all"; labelKey: string }[] = [
  { value: "all",           labelKey: "audit.filterAll" },
  { value: "payment",       labelKey: "audit.filterPayments" },
  { value: "member",        labelKey: "audit.filterMembers" },
  { value: "scannerdevice", labelKey: "audit.filterCheckins" },
  { value: "gym",           labelKey: "audit.filterSystem" },
];

export function AuditLog({ rows }: { rows: AuditRow[] }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AuditCategory | "all">("all");

  const q = query.trim().toLowerCase();

  // Search-filtered set (drives both the stat cards stay on full data, but the
  // tab counts + list react to the query) — matches the prototype's behaviour.
  const searched = useMemo(() => {
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.action.toLowerCase().includes(q) ||
        r.actor.toLowerCase().includes(q) ||
        r.time.includes(q) ||
        (r.detail ?? "").toLowerCase().includes(q)
    );
  }, [rows, q]);

  const visible = useMemo(
    () => (filter === "all" ? searched : searched.filter((r) => r.category === filter)),
    [searched, filter]
  );

  const tabCount = (value: AuditCategory | "all") =>
    value === "all" ? searched.length : searched.filter((r) => r.category === value).length;

  const statCount = (category: AuditCategory | "all") =>
    category === "all" ? rows.length : rows.filter((r) => r.category === category).length;

  return (
    <>
      {/* Search row (the navy page header carries the title) */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{ position: "relative", width: 240, maxWidth: "100%" }}>
          <Search
            style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "var(--d-tx3)", pointerEvents: "none" }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("audit.searchPlaceholder")}
            style={{ width: "100%", height: 36, borderRadius: 10, border: "1px solid var(--d-bdr)", background: "white", color: "var(--d-tx)", fontFamily: "inherit", fontSize: 13, fontWeight: 500, padding: "0 12px 0 34px", outline: "none" }}
          />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map((c) => (
          <div
            key={c.category}
            style={{ background: "white", borderRadius: 16, padding: "18px 20px 16px", boxShadow: "var(--d-sh1)", position: "relative", display: "flex", flexDirection: "column", gap: 4, overflow: "hidden" }}
          >
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: c.accent, borderRadius: "16px 16px 0 0" }} />
            <div style={{ position: "absolute", top: 14, right: 14, width: 34, height: 34, borderRadius: 10, background: c.iconBg, color: c.iconColor, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <c.icon style={{ width: 16, height: 16 }} />
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.9px", textTransform: "uppercase", color: "var(--d-tx3)", whiteSpace: "nowrap" }}>
              {t(c.labelKey)}
            </span>
            <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-1.5px", lineHeight: 1, marginTop: 5, color: "var(--d-tx)" }}>
              {statCount(c.category)}
            </div>
            <span style={{ fontSize: 11, fontWeight: 500, color: "var(--d-tx3)" }}>{t(c.hintKey)}</span>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 3, background: "white", padding: 4, borderRadius: 12, boxShadow: "var(--d-sh1)", width: "fit-content", maxWidth: "100%", flexWrap: "wrap" }}>
        {TABS.map((tb) => {
          const active = filter === tb.value;
          const count = tabCount(tb.value);
          return (
            <button
              key={tb.value}
              type="button"
              onClick={() => setFilter(tb.value)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 18px", borderRadius: 9,
                fontSize: 13, fontWeight: 700, border: "none", cursor: "pointer", fontFamily: "inherit",
                whiteSpace: "nowrap",
                background: active ? "var(--d-accent)" : "transparent",
                color: active ? "#fff" : "var(--d-tx3)",
                boxShadow: active ? "0 2px 8px rgba(59,123,246,.35)" : "none",
              }}
            >
              {t(tb.labelKey)}
              <span
                style={{
                  fontSize: 10.5, fontWeight: 800, padding: "1px 7px", borderRadius: 99, letterSpacing: "0.2px",
                  background: active ? "rgba(255,255,255,.22)" : "var(--d-bg)",
                  color: active ? "#fff" : "var(--d-tx3)",
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Log list */}
      <div style={{ background: "white", borderRadius: 16, boxShadow: "var(--d-sh1)", overflow: "hidden" }}>
        {visible.length === 0 ? (
          <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--d-tx3)" }}>
            <FileText style={{ width: 36, height: 36, color: "var(--d-tx3)", opacity: 0.4, margin: "0 auto 12px" }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--d-tx2)", marginBottom: 4 }}>
              {t("audit.emptyTitle")}
            </div>
            <div style={{ fontSize: 12.5 }}>{t("audit.emptySub")}</div>
          </div>
        ) : (
          visible.map((r, i) => {
            const cat = CAT[r.category];
            const Icon = cat.icon;
            const inner = (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "14px 20px",
                  borderBottom: i === visible.length - 1 ? "none" : "1px solid var(--d-bdr)",
                }}
                className="audit-entry"
              >
                <div style={{ width: 36, height: 36, borderRadius: 10, background: cat.bg, color: cat.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon style={{ width: 15, height: 15 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--d-tx)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {r.action}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--d-tx3)", fontWeight: 500, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                    <span>{r.time}</span>
                    <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--d-tx3)", flexShrink: 0 }} />
                    <span style={{ color: "var(--d-accent)", fontWeight: 600 }}>{r.actor}</span>
                    {r.detail && (
                      <>
                        <span style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--d-tx3)", flexShrink: 0 }} />
                        <span>{r.detail}</span>
                      </>
                    )}
                  </div>
                </div>
                <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, letterSpacing: "0.8px", padding: "3px 9px", borderRadius: 6, textTransform: "uppercase", background: cat.bg, color: cat.color }}>
                  {t(cat.badgeKey)}
                </span>
              </div>
            );
            return r.href ? (
              <Link key={r.id} href={r.href} style={{ display: "block", textDecoration: "none" }}>
                {inner}
              </Link>
            ) : (
              <div key={r.id}>{inner}</div>
            );
          })
        )}
      </div>
    </>
  );
}
