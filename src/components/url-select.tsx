"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// A compact filter dropdown that drives a single URL query param. Preserves all
// other params and resets pagination. Used for the secondary filters (plan,
// method, date range) that sit beside the primary status chips.
export function UrlSelect({
  param,
  value,
  options,
  ariaLabel,
}: {
  param: string;
  value: string;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(sp.toString());
    const v = e.target.value;
    if (v) params.set(param, v);
    else params.delete(param);
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={onChange}
      className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[var(--foreground)] outline-none focus:ring-2 focus:ring-black/10"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
