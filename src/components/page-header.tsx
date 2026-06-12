import type { LucideIcon } from "lucide-react";

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  actions,
  tabs,
  tone = "light",
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <div
      className={
        dark
          ? "page-header-banner text-white"
          : "bg-white border-b border-[var(--border)]"
      }
    >
      <div className="px-4 lg:px-8 py-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${dark ? "bg-white/10" : "bg-[var(--brand-soft)]"}`}
            >
              <Icon
                className={`w-5 h-5 ${dark ? "text-[#3b7bf6]" : "text-[var(--brand-strong)]"}`}
              />
            </div>
          )}
          <div className="min-w-0">
            <h1
              className={`text-xl font-semibold leading-tight truncate ${dark ? "text-white" : "text-[var(--foreground)]"}`}
            >
              {title}
            </h1>
            {subtitle && (
              <p
                className={`text-xs mt-0.5 truncate ${dark ? "text-white/70" : "text-[var(--muted)]"}`}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
      {tabs && (
        <div className={`px-4 lg:px-8 ${dark ? "border-t border-white/10" : "border-t border-[var(--border)]"}`}>
          {tabs}
        </div>
      )}
    </div>
  );
}
