"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { MoreVertical, User, Pencil, MessageCircle, RefreshCw } from "lucide-react";
import { buildWaUrl } from "@/lib/templates";
import { renewMembership } from "@/lib/payment-actions";
import { useT, useLocale } from "@/components/i18n-provider";

// Row-level quick actions. Lives in the list so triage doesn't require opening
// each profile. Freeze/Cancel deliberately stay on the detail page — they need
// date-range/reason modals that would clutter the list.
export function MemberRowActions({
  memberId,
  name,
  phone,
  expiryDate,
}: {
  memberId: string;
  name: string;
  phone: string | null;
  expiryDate: string; // ISO — used for the early-renewal guard
}) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [renewing, startRenew] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // Opening the menu must not navigate the underlying row link: cancel the
  // button's own default and stop the click from bubbling to the row.
  function stop(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  // Menu items DO navigate — only keep the click from bubbling to the row link,
  // and close the menu. (Calling preventDefault here would cancel the item's own
  // navigation, which is the bug we are avoiding.)
  function stopOnly(e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(false);
  }

  // Renew is a mutation, not navigation. Invoke the server action directly via a
  // transition — NOT a <form> submit — because closing the menu would unmount the
  // form and cancel the submit before it dispatches. Close the menu only after it
  // resolves.
  function onRenew(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Early-renewal guard: confirm if the membership is still valid.
    const expiry = new Date(expiryDate);
    if (new Date() < expiry) {
      const ok = window.confirm(
        t("rowActions.renewConfirm", { name, date: expiry.toLocaleDateString(locale) })
      );
      if (!ok) return;
    }
    const fd = new FormData();
    fd.set("method", "CASH");
    startRenew(async () => {
      await renewMembership(memberId, fd);
      setOpen(false);
    });
  }

  const waUrl =
    phone && phone.trim()
      ? buildWaUrl(phone, t("rowActions.waHello", { name }))
      : null;

  return (
    <div ref={ref} className="relative" onClick={stop}>
      <button
        type="button"
        aria-label={t("members.actions")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          stop(e);
          setOpen((v) => !v);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-[var(--border)] bg-white py-1 shadow-lg"
        >
          <Link
            role="menuitem"
            href={`/members/${memberId}`}
            onClick={stopOnly}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--background)]"
          >
            <User className="h-4 w-4 text-[var(--muted)]" />
            {t("rowActions.profile")}
          </Link>
          <Link
            role="menuitem"
            href={`/members/${memberId}/edit`}
            onClick={stopOnly}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--background)]"
          >
            <Pencil className="h-4 w-4 text-[var(--muted)]" />
            {t("rowActions.edit")}
          </Link>
          {/* Quick renew records a Nağd payment for the next period and extends
              the membership. Use the detail page to renew with another method. */}
          <button
            type="button"
            role="menuitem"
            disabled={renewing}
            onClick={onRenew}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--background)] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 text-[var(--brand-strong)] ${renewing ? "animate-spin" : ""}`}
            />
            {renewing ? t("rowActions.renewing") : t("rowActions.renewCash")}
          </button>
          {waUrl && (
            <a
              role="menuitem"
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={stopOnly}
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--background)]"
            >
              <MessageCircle className="h-4 w-4 text-emerald-500" />
              {t("common.whatsapp")}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
