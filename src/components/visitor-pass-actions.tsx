"use client";

import { useState } from "react";
import { UserPlus, QrCode } from "lucide-react";
import { VisitorPassDialog } from "@/components/visitor-pass-dialog";
import { useT } from "@/components/i18n-provider";

export function VisitorPassActions() {
  const t = useT();
  const [open, setOpen] = useState<"quick" | "daypass" | null>(null);

  return (
    <div className="grid grid-cols-2 gap-2.5 mt-3.5">
      <button type="button" onClick={() => setOpen("quick")} className="qbtn">
        <UserPlus className="w-[15px] h-[15px]" strokeWidth={2.3} />
        {t("scan.quickEntry")}
      </button>
      <button type="button" onClick={() => setOpen("daypass")} className="qbtn">
        <QrCode className="w-[15px] h-[15px]" strokeWidth={2.3} />
        {t("scan.daypass")}
      </button>

      <VisitorPassDialog
        mode={open === "daypass" ? "daypass" : "quick"}
        open={open !== null}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
