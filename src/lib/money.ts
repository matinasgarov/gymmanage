// Money helpers. DB stores Decimal(10,2); never sum AZN as repeatedly-added
// JS floats. Accumulate in integer cents (exact for 2-decimal currency), then
// convert to a display number/string exactly once at the boundary.

type DecimalLike = { toString: () => string } | number | string | null | undefined;

// Parse any Decimal-ish value into integer cents (rounded half-up).
export function toCents(value: DecimalLike): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value.toString());
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function sumCents(values: DecimalLike[]): number {
  let total = 0;
  for (const v of values) total += toCents(v);
  return total;
}

export function centsToNumber(cents: number): number {
  return cents / 100;
}

export function formatAZN(value: DecimalLike): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "number" ? value : Number(value.toString());
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(2)} ₼`;
}

export function formatCentsAZN(cents: number): string {
  return `${(cents / 100).toFixed(2)} ₼`;
}
