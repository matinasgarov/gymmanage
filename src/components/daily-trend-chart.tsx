"use client";

import type { HeatmapResult } from "@/lib/attendance";

export function DailyTrendChart({ buckets }: { buckets: HeatmapResult["dailyBuckets"] }) {
  if (buckets.length < 2) return null;

  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const n = buckets.length;

  const step = Math.max(1, Math.floor(n / 6));
  const labelSet = new Set<number>([0]);
  for (let i = step; i < n; i += step) labelSet.add(i);
  labelSet.add(n - 1);

  return (
    <div>
      <div className="flex items-end gap-[2px] h-14 mb-1">
        {buckets.map((b, i) => (
          <div
            key={b.date}
            className="flex-1 min-w-0 rounded-t-[2px]"
            style={{
              height: `${Math.max(4, (b.count / maxCount) * 100)}%`,
              backgroundColor: "var(--brand)",
              opacity: b.count === 0 ? 0.08 : 0.3 + (b.count / maxCount) * 0.7,
            }}
            title={`${b.date}: ${b.count}`}
          />
        ))}
      </div>
      <div className="flex">
        {buckets.map((b, i) => (
          <div key={b.date} className="flex-1 min-w-0 text-center overflow-hidden">
            {labelSet.has(i) ? (
              <span className="text-[9px] text-[var(--muted)] select-none">{b.date.slice(5)}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
