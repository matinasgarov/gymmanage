"use client";

import { useTransition } from "react";
import { setStaffActive } from "@/lib/auth-actions";

export function StaffToggleButton({
  staffId,
  active,
}: {
  staffId: string;
  active: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <button
      onClick={() => start(() => setStaffActive(staffId, !active))}
      disabled={pending}
      className="text-xs underline text-[var(--muted)] disabled:opacity-40"
    >
      {active ? "Deaktiv et" : "Aktiv et"}
    </button>
  );
}
