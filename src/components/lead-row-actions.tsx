"use client";

import Link from "next/link";
import { useTransition } from "react";
import { UserPlus, Phone, X, Trash2 } from "lucide-react";
import { setLeadStatus, deleteLead } from "@/lib/lead-actions";

export function LeadRowActions({
  leadId,
  status,
  convertedMemberId,
}: {
  leadId: string;
  status: string;
  convertedMemberId: string | null;
}) {
  const [pending, start] = useTransition();

  if (status === "CONVERTED" && convertedMemberId) {
    return (
      <Link
        href={`/members/${convertedMemberId}`}
        className="text-xs text-emerald-700 underline shrink-0"
      >
        Üzvə bax →
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5 shrink-0">
      <Link
        href={`/members/new?leadId=${leadId}`}
        className="inline-flex items-center gap-1 text-xs bg-[var(--brand)] hover:bg-[var(--brand-strong)] text-white rounded-full px-3 py-1.5 font-medium"
      >
        <UserPlus className="w-3 h-3" />
        Üzv yarat
      </Link>
      {status !== "CONTACTED" && (
        <button
          type="button"
          onClick={() => start(() => setLeadStatus(leadId, "CONTACTED"))}
          disabled={pending}
          className="inline-flex items-center gap-1 text-xs btn-ghost"
        >
          <Phone className="w-3 h-3" />
          Əlaqə saxlandı
        </button>
      )}
      {status !== "LOST" && (
        <button
          type="button"
          onClick={() => start(() => setLeadStatus(leadId, "LOST"))}
          disabled={pending}
          className="inline-flex items-center gap-1 text-xs btn-ghost"
        >
          <X className="w-3 h-3" />
          İtirildi
        </button>
      )}
      <button
        type="button"
        onClick={() => start(() => deleteLead(leadId))}
        disabled={pending}
        className="inline-flex items-center gap-1 text-xs text-red-600 hover:bg-red-50 rounded-full px-2 py-1.5"
        title="Sil"
        aria-label="Sil"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}
