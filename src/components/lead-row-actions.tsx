"use client";

import Link from "next/link";
import { useTransition } from "react";
import { UserPlus, Phone, X, Trash2 } from "lucide-react";
import { setLeadStatus, deleteLead } from "@/lib/lead-actions";
import { useT } from "@/components/i18n-provider";

export function LeadRowActions({
  leadId,
  status,
  convertedMemberId,
}: {
  leadId: string;
  status: string;
  convertedMemberId: string | null;
}) {
  const t = useT();
  const [pending, start] = useTransition();

  if (status === "CONVERTED" && convertedMemberId) {
    return (
      <Link
        href={`/members/${convertedMemberId}`}
        className="text-xs font-semibold underline shrink-0"
        style={{ color: "#10b981" }}
      >
        {t("leads.viewMember")}
      </Link>
    );
  }

  const ghostBtn: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    fontWeight: 600,
    padding: "7px 12px",
    borderRadius: 9,
    border: "1px solid var(--d-bdr)",
    background: "var(--d-bg)",
    color: "var(--d-tx2)",
    cursor: "pointer",
  };

  return (
    <div className="flex flex-wrap gap-1.5 shrink-0">
      <Link
        href={`/members/new?leadId=${leadId}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          fontSize: 12,
          fontWeight: 700,
          padding: "7px 14px",
          borderRadius: 9,
          background: "#3b7bf6",
          color: "#fff",
          textDecoration: "none",
          boxShadow: "0 2px 8px rgba(59,123,246,.3)",
        }}
      >
        <UserPlus className="w-3 h-3" />
        {t("leads.createMember")}
      </Link>
      {status !== "CONTACTED" && (
        <button
          type="button"
          onClick={() => start(() => setLeadStatus(leadId, "CONTACTED"))}
          disabled={pending}
          style={ghostBtn}
        >
          <Phone className="w-3 h-3" />
          {t("leads.markContacted")}
        </button>
      )}
      {status !== "LOST" && (
        <button
          type="button"
          onClick={() => start(() => setLeadStatus(leadId, "LOST"))}
          disabled={pending}
          style={ghostBtn}
        >
          <X className="w-3 h-3" />
          {t("leads.markLost")}
        </button>
      )}
      <button
        type="button"
        onClick={() => start(() => deleteLead(leadId))}
        disabled={pending}
        style={{ ...ghostBtn, color: "#ef4444", padding: "7px 10px" }}
        title={t("common.delete")}
        aria-label={t("common.delete")}
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}
