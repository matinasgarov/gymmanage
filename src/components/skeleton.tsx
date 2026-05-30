export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-slate-200/70 rounded ${className}`}
      aria-hidden
    />
  );
}

export function SkeletonShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--background)] flex">
      {/* sidebar placeholder */}
      <div className="hidden lg:block w-60 bg-[var(--sidebar-bg)]" />
      <div className="flex-1">
        <div className="page-header-banner h-20" />
        <div className="px-4 lg:px-8 py-6">{children}</div>
      </div>
    </div>
  );
}
