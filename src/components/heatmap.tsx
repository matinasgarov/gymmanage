"use client";

import type { HeatmapResult } from "@/lib/attendance";
import { useT } from "@/components/i18n-provider";

export function Heatmap({ data }: { data: HeatmapResult }) {
  const t = useT();
  const { grid, max, dayLabels, dayLabelsFull } = data;
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <div className="min-w-[640px]">
        {/* Hour header */}
        <div className="flex">
          <div className="w-10 shrink-0" />
          {hours.map((h) => (
            <div
              key={h}
              className="flex-1 text-center text-[10px] text-[var(--muted)] pb-1"
            >
              {h}
            </div>
          ))}
        </div>
        {dayLabels.map((label, day) => (
          <div key={day} className="flex items-stretch">
            <div className="w-10 shrink-0 flex items-center text-[11px] text-[var(--muted)]">
              {label}
            </div>
            {hours.map((hour) => {
              const cell = grid[day * 24 + hour];
              const intensity = max > 0 ? cell.count / max : 0;
              const opacity = cell.count === 0 ? 0 : 0.15 + intensity * 0.85;
              return (
                <div
                  key={hour}
                  className="flex-1 aspect-square rounded-[3px] mx-[1px] my-[1px] border border-slate-100"
                  style={{
                    backgroundColor:
                      cell.count > 0
                        ? `color-mix(in srgb, var(--brand) ${Math.round(opacity * 100)}%, transparent)`
                        : "rgb(248 250 252)",
                  }}
                  title={
                    cell.count > 0
                      ? `${dayLabelsFull[day]} ${hour.toString().padStart(2, "0")}:00 — ${t("units.entries", { count: cell.count })}`
                      : `${dayLabelsFull[day]} ${hour.toString().padStart(2, "0")}:00 — 0`
                  }
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
