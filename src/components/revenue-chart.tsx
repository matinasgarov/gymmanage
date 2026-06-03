"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { label: string; total: number };

const RANGES = [
  { months: 3, label: "3 ay" },
  { months: 6, label: "6 ay" },
  { months: 12, label: "1 il" },
] as const;

function fmtAzn(n: number): string {
  return `${n.toLocaleString("az", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₼`;
}

function titleFor(months: number): string {
  return months === 12 ? "1 illik gəlir" : `${months} aylıq gəlir`;
}

// Full year of monthly buckets is passed in; we slice to the selected range.
export function RevenueChart({ data }: { data: Point[] }) {
  const [months, setMonths] = useState(6);
  const sliced = data.slice(-months);
  const total = sliced.reduce((sum, p) => sum + p.total, 0);

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[var(--brand-strong)]" />
          <h2 className="font-medium">{titleFor(months)}</h2>
        </div>
        <span className="text-lg font-semibold">{fmtAzn(total)}</span>
      </div>

      <div className="mb-3 flex gap-1">
        {RANGES.map((r) => (
          <button
            key={r.months}
            type="button"
            onClick={() => setMonths(r.months)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              months === r.months
                ? "bg-[var(--brand)] text-white"
                : "bg-neutral-100 text-[var(--muted)] hover:bg-neutral-200"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sliced} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis
              tickLine={false}
              axisLine={false}
              fontSize={11}
              width={52}
              tickFormatter={(v) =>
                v >= 1000 ? `${(v / 1000).toLocaleString("az", { maximumFractionDigits: 1 })}k` : `${v}`
              }
            />
            <Tooltip
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
              contentStyle={{ fontSize: 12 }}
              formatter={(v) => [fmtAzn(Number(v ?? 0)), "Gəlir"]}
            />
            <Bar dataKey="total" fill="#0f172a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
