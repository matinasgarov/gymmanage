"use client";

import type { HeatmapResult } from "@/lib/attendance";
import { useT } from "@/components/i18n-provider";

export function Heatmap({ data }: { data: HeatmapResult }) {
  const t = useT();
  const { grid, max, dayLabels, dayLabelsFull } = data;
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 720 }}>
        {/* Hour header row */}
        <div style={{ display: "flex" }}>
          <div style={{ width: 36, flexShrink: 0 }} />
          {hours.map((h) => (
            <div
              key={h}
              style={{ flex: 1, textAlign: "center", fontSize: 10, fontWeight: 600, color: "#8aa0bc", paddingBottom: 4 }}
            >
              {h}
            </div>
          ))}
        </div>
        {/* Day rows */}
        {dayLabels.map((label, day) => (
          <div key={day} style={{ display: "flex", alignItems: "stretch", marginBottom: 3 }}>
            <div style={{ width: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 8, fontSize: 10, fontWeight: 600, color: "#8aa0bc" }}>
              {label}
            </div>
            {hours.map((hour) => {
              const cell = grid[day * 24 + hour];
              const opacity = max > 0 && cell.count > 0 ? Math.max(0.12, cell.count / max) : 0;
              const tip = cell.count > 0
                ? `${dayLabelsFull[day]} ${hour.toString().padStart(2, "0")}:00 — ${t("units.entries", { count: cell.count })}`
                : `${dayLabelsFull[day]} ${hour.toString().padStart(2, "0")}:00 — 0`;
              return (
                <div
                  key={hour}
                  style={{
                    flex: 1,
                    height: 28,
                    borderRadius: 5,
                    marginLeft: 1.5,
                    marginRight: 1.5,
                    background: cell.count > 0
                      ? `rgba(59,123,246,${opacity})`
                      : "rgba(59,123,246,.12)",
                    cursor: "default",
                    transition: "transform 0.1s",
                  }}
                  title={tip}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1.15)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
