"use client";

import { useState } from "react";
import { TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useT } from "@/components/i18n-provider";

type Point = { label: string; total: number };

const RANGES = [
  { months: 3, labelKey: "chart.range3" },
  { months: 6, labelKey: "chart.range6" },
  { months: 12, labelKey: "chart.range12" },
] as const;

export function RevenueChart({ data }: { data: Point[] }) {
  const t = useT();
  const [months, setMonths] = useState(6);
  const sliced = data.slice(-months);
  const total = sliced.reduce((sum, p) => sum + p.total, 0);

  // Pin to "en-US" so SSR (Node ICU) and the browser produce identical output —
  // a dynamic locale like "az" isn't in Node's default ICU and mismatches.
  const fmtAzn = (n: number) =>
    `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₼`;
  const title = months === 12 ? t("chart.titleYear") : t("chart.titleMonths", { count: months });

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-[18px] w-[18px] text-[#3b7bf6] flex-shrink-0" />
          <h2 className="text-[15.5px] font-bold text-[#0b1628] whitespace-nowrap">{title}</h2>
        </div>
        <div className="flex items-center gap-4">
          {/* Segmented tab control */}
          <div className="flex gap-[3px] bg-[#eef1f8] p-1 rounded-[11px]">
            {RANGES.map((r) => (
              <button
                key={r.months}
                type="button"
                onClick={() => setMonths(r.months)}
                className={`px-3.5 py-[5px] rounded-[8px] text-xs font-bold whitespace-nowrap transition-all duration-150 ${
                  months === r.months
                    ? "bg-white text-[#0b1628] shadow-[0_1px_5px_rgba(0,0,0,.1)]"
                    : "text-[#8aa0bc] hover:text-[#4a637a]"
                }`}
              >
                {t(r.labelKey)}
              </button>
            ))}
          </div>
          <span className="text-[17px] font-extrabold tracking-[-0.4px] text-[#0b1628] whitespace-nowrap">
            {total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-[13px] font-medium text-[#8aa0bc] ml-0.5">₼</span>
          </span>
        </div>
      </div>

      <div className="h-[220px] w-full min-w-0">
        <ResponsiveContainer width="100%" height={220} minWidth={0}>
          <AreaChart data={sliced} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="revenue-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b7bf6" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#3b7bf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fontWeight: 600, fill: "#8aa0bc", fontFamily: "inherit" }}
              dy={4}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={48}
              tick={{ fontSize: 11, fill: "#8aa0bc", fontFamily: "inherit" }}
              tickFormatter={(v) =>
                v >= 1000
                  ? `${(v / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k`
                  : `${v}`
              }
            />
            <Tooltip
              contentStyle={{
                background: "#0b1628",
                border: "none",
                borderRadius: 10,
                padding: "10px 14px",
                fontSize: 14,
                fontWeight: 700,
                color: "#fff",
                boxShadow: "0 4px 20px rgba(0,0,0,.3)",
              }}
              labelStyle={{ color: "rgba(255,255,255,.45)", fontSize: 11, fontWeight: 400, marginBottom: 2 }}
              itemStyle={{ color: "#fff" }}
              cursor={{ stroke: "rgba(59,123,246,.2)", strokeWidth: 1 }}
              formatter={(v) => [fmtAzn(Number(v ?? 0)), t("chart.revenue")]}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#3b7bf6"
              strokeWidth={2.5}
              fill="url(#revenue-gradient)"
              dot={{ r: 5, fill: "#3b7bf6", stroke: "#ffffff", strokeWidth: 2.5 }}
              activeDot={{ r: 7, fill: "#3b7bf6", stroke: "#ffffff", strokeWidth: 2.5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
