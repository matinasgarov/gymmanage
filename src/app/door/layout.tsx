export default function DoorLayout({ children }: { children: React.ReactNode }) {
  // Full-bleed: no AppShell sidebar, no top nav, mobile-first.
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {children}
    </div>
  );
}
