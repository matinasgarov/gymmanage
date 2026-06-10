"use client";

import { useTransition } from "react";
import { setStaffActive } from "@/lib/auth-actions";
import { useT } from "@/components/i18n-provider";

export function StaffToggleButton({
  staffId,
  active,
}: {
  staffId: string;
  active: boolean;
}) {
  const t = useT();
  const [pending, start] = useTransition();

  return (
    <button
      onClick={() => start(() => setStaffActive(staffId, !active))}
      disabled={pending}
      className="text-xs underline text-[var(--muted)] disabled:opacity-40"
    >
      {active ? t("settings.staffDeactivate") : t("settings.staffActivate")}
    </button>
  );
}
