"use client";

import type { HeatmapResult } from "@/lib/attendance";

export function DailyTrendChart({ buckets }: { buckets: HeatmapResult["dailyBuckets"] }) {
  if (buckets.length < 2) return null;

  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const n = buckets.length;

  const step = Math.max(1, Math.floor(n / 10));
  const labelSet = new Set<number>([0]);
  for (let i = step; i < n; i += step) labelSet.add(i);
  labelSet.add(n - 1);

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Chart area */}
      <div style={{ flex: 1, position: "relative" }}>
        {/* Y-axis gridlines */}
        {gridLines.map((pct) => (
          <div
            key={pct}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: `${pct * 100}%`,
              borderTop: "1px solid rgba(138,160,188,.12)",
              pointerEvents: "none",
            }}
          />
        ))}
        {/* Bars */}
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "flex-end", gap: 2 }}>
          {buckets.map((b) => {
            const heightPct = Math.max(2, (b.count / maxCount) * 100);
            const color = b.count > 10 ? "#3b7bf6" : "rgba(59,123,246,.25)";
            return (
              <div
                key={b.date}
                style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "flex-end", height: "100%" }}
                title={`${b.date}: ${b.count}`}
              >
                <div
                  style={{
                    width: "100%",
                    height: `${heightPct}%`,
                    background: color,
                    borderRadius: "4px 4px 0 0",
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
      {/* X-axis labels */}
      <div style={{ display: "flex", marginTop: 6 }}>
        {buckets.map((b, i) => (
          <div key={b.date} style={{ flex: 1, minWidth: 0, textAlign: "center", overflow: "hidden" }}>
            {labelSet.has(i) ? (
              <span style={{ fontSize: 10, fontWeight: 600, color: "#8aa0bc", whiteSpace: "nowrap" }}>
                {b.date.slice(5)}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
