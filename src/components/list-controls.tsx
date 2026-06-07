import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Shared list-page controls used by the Members and Payments triage pages so
// the two stay visually and behaviourally identical.

export function Chip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-[var(--brand)] text-white"
          : "bg-neutral-100 text-[var(--muted)] hover:bg-neutral-200"
      }`}
    >
      {label}
    </Link>
  );
}

// Windowed page numbers: first, last, and ±1 around the current page, with
// ellipsis filling the gaps.
function pageWindow(cur: number, total: number): (number | "…")[] {
  const wanted = new Set<number>([1, total, cur - 1, cur, cur + 1]);
  const pages = [...wanted].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const n of pages) {
    if (prev && n - prev > 1) out.push("…");
    out.push(n);
    prev = n;
  }
  return out;
}

export function Pagination({
  page,
  totalPages,
  hrefForPage,
}: {
  page: number;
  totalPages: number;
  hrefForPage: (n: number) => string;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-1">
      <PagerLink href={hrefForPage(page - 1)} disabled={page <= 1} aria-label="Əvvəlki">
        <ChevronLeft className="w-4 h-4" />
      </PagerLink>
      {pageWindow(page, totalPages).map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="px-2 text-sm text-[var(--muted)]">
            …
          </span>
        ) : (
          <PagerLink key={p} href={hrefForPage(p)} active={p === page}>
            {p}
          </PagerLink>
        )
      )}
      <PagerLink href={hrefForPage(page + 1)} disabled={page >= totalPages} aria-label="Növbəti">
        <ChevronRight className="w-4 h-4" />
      </PagerLink>
    </div>
  );
}

function PagerLink({
  href,
  active,
  disabled,
  children,
  ...rest
}: {
  href: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  "aria-label"?: string;
}) {
  const cls =
    "min-w-9 h-9 px-2 inline-flex items-center justify-center rounded-lg text-sm transition-colors";
  if (disabled) {
    return (
      <span className={`${cls} text-[var(--muted)] opacity-40`} aria-disabled {...rest}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      {...rest}
      className={`${cls} ${
        active
          ? "bg-[var(--brand)] text-white"
          : "text-[var(--foreground)] hover:bg-[var(--background)]"
      }`}
    >
      {children}
    </Link>
  );
}
