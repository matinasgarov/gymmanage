"use client";

import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { manualLookup, grantManualEntry, type ScanResult } from "@/lib/scan-actions";

type Hit = {
  id: string;
  name: string;
  publicId: string;
  phone: string;
  status: string;
};

export function DoorManualLookup({
  onResult,
}: {
  onResult: (r: ScanResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [isPending, startTransition] = useTransition();

  function search(value: string) {
    setQ(value);
    if (value.trim().length < 2) {
      setHits([]);
      return;
    }
    startTransition(async () => {
      const results = await manualLookup(value);
      setHits(results as Hit[]);
    });
  }

  function grant(memberId: string) {
    startTransition(async () => {
      const result = await grantManualEntry(memberId);
      onResult(result);
      setOpen(false);
      setQ("");
      setHits([]);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm text-[var(--brand-strong)] underline"
      >
        Telefonu olmayan üzv?
      </button>
    );
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Search className="w-4 h-4 text-[var(--muted)]" />
        <input
          autoFocus
          value={q}
          onChange={(e) => search(e.target.value)}
          placeholder="Ad, telefon, ID..."
          className="flex-1 outline-none bg-transparent text-sm"
        />
        <button onClick={() => setOpen(false)} aria-label="Bağla">
          <X className="w-4 h-4 text-[var(--muted)]" />
        </button>
      </div>
      {isPending && <p className="text-xs text-[var(--muted)]">Axtarılır...</p>}
      {hits.length > 0 && (
        <ul className="divide-y divide-[var(--border)]">
          {hits.map((h) => (
            <li key={h.id}>
              <button
                onClick={() => grant(h.id)}
                className="w-full text-left py-2 hover:bg-[var(--background)]"
              >
                <div className="text-sm font-medium">{h.name}</div>
                <div className="text-[11px] text-[var(--muted)]">
                  {h.publicId} · {h.phone}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
