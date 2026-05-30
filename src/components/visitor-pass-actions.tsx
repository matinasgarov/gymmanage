"use client";

import { useState } from "react";
import { UserPlus, QrCode } from "lucide-react";
import { VisitorPassDialog } from "@/components/visitor-pass-dialog";

export function VisitorPassActions() {
  const [open, setOpen] = useState<"quick" | "daypass" | null>(null);

  return (
    <div className="grid grid-cols-2 gap-2 mt-4">
      <button
        type="button"
        onClick={() => setOpen("quick")}
        className="btn-ghost inline-flex items-center justify-center gap-1.5"
      >
        <UserPlus className="w-4 h-4" />
        Tez giriş
      </button>
      <button
        type="button"
        onClick={() => setOpen("daypass")}
        className="btn-ghost inline-flex items-center justify-center gap-1.5"
      >
        <QrCode className="w-4 h-4" />
        Günlük QR
      </button>

      <VisitorPassDialog
        mode={open === "daypass" ? "daypass" : "quick"}
        open={open !== null}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
