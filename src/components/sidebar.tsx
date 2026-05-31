"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  ScanLine,
  Receipt,
  Settings,
  Menu,
  X,
  Dumbbell,
  ScrollText,
  Megaphone,
  Inbox,
  UserCheck,
  Activity,
  HeartPulse,
} from "lucide-react";
import { logout } from "@/lib/auth-actions";

type NavItem = {
  href: string;
  label: string;
  icon: typeof Users;
  match?: (path: string) => boolean;
  highlight?: boolean;
  ownerOnly?: boolean;
};

const ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Panel", icon: LayoutDashboard, ownerOnly: true },
  {
    href: "/members",
    label: "Üzvlər",
    icon: Users,
    match: (p) => p.startsWith("/members"),
    ownerOnly: true,
  },
  { href: "/scan", label: "Skaner", icon: ScanLine, highlight: true },
  {
    href: "/payments",
    label: "Ödənişlər",
    icon: Receipt,
    match: (p) => p.startsWith("/payments"),
    ownerOnly: true,
  },
  {
    href: "/visitors",
    label: "Qonaqlar",
    icon: UserCheck,
    match: (p) => p.startsWith("/visitors"),
    ownerOnly: true,
  },
  {
    href: "/leads",
    label: "Müraciətlər",
    icon: Inbox,
    match: (p) => p.startsWith("/leads"),
    ownerOnly: true,
  },
  { href: "/reminders", label: "Xatırlatmalar", icon: Megaphone, ownerOnly: true },
  {
    href: "/retention",
    label: "Geri qaytarma",
    icon: HeartPulse,
    match: (p) => p.startsWith("/retention"),
    ownerOnly: true,
  },
  {
    href: "/attendance",
    label: "Davamiyyət",
    icon: Activity,
    match: (p) => p.startsWith("/attendance"),
    ownerOnly: true,
  },
  { href: "/audit", label: "Audit jurnalı", icon: ScrollText, ownerOnly: true },
];

export function Sidebar({
  gymName,
  gymLogoUrl,
  userName,
  role,
}: {
  gymName: string;
  gymLogoUrl: string | null;
  userName: string;
  role: "OWNER" | "STAFF";
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const visibleItems = ITEMS.filter((it) => role === "OWNER" || !it.ownerOnly);

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 bg-[var(--sidebar-bg)] text-white flex items-center justify-between px-4 h-14">
        <button
          onClick={() => setOpen(true)}
          aria-label="Menyu"
          className="p-2 -ml-2"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          {gymLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={gymLogoUrl} alt={gymName} className="w-6 h-6 rounded object-cover" />
          ) : (
            <Dumbbell className="w-4 h-4 text-[var(--brand)]" />
          )}
          <span className="font-semibold text-sm truncate">{gymName}</span>
        </div>
        <Link href="/scan" aria-label="Skaner" className="p-2 -mr-2">
          <ScanLine className="w-5 h-5 text-[var(--brand)]" />
        </Link>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 lg:z-auto h-screen w-60 bg-[var(--sidebar-bg)] text-[var(--sidebar-fg)] flex flex-col transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div className="px-4 h-16 flex items-center justify-between border-b border-[var(--sidebar-divider)]">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-white/95 flex items-center justify-center overflow-hidden">
              {gymLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={gymLogoUrl} alt={gymName} className="w-full h-full object-cover" />
              ) : (
                <Dumbbell className="w-4 h-4 text-[var(--sidebar-bg)]" />
              )}
            </div>
            <div className="text-white font-semibold text-sm truncate">
              {gymName}
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden p-1"
            aria-label="Bağla"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {visibleItems.map((item) => {
            const active = item.match
              ? item.match(pathname)
              : pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${active
                  ? "bg-[var(--brand)]/15 text-white border-l-2 border-[var(--brand)]"
                  : "hover:bg-white/5 text-[var(--sidebar-fg)]"
                  }`}
              >
                <Icon
                  className={`w-[18px] h-[18px] ${active ? "text-[var(--brand)]" : item.highlight ? "text-[var(--brand)]" : "text-[var(--sidebar-fg)]"}`}
                />
                <span>{item.label}</span>
                {item.highlight && !active && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-pulse" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-[var(--sidebar-divider)] flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs text-white font-semibold">
            {userName.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-white truncate">{userName}</div>
            <form action={logout}>
              <button
                type="submit"
                className="text-[11px] text-[var(--sidebar-fg)] hover:text-white"
              >
                Çıxış
              </button>
            </form>
          </div>
          {role === "OWNER" && (
            <Link
              href="/settings"
              className="text-[var(--sidebar-fg)] hover:text-white p-1"
              aria-label="Tənzimləmələr"
            >
              <Settings className="w-4 h-4" />
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
