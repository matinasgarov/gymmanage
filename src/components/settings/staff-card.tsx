import { prisma } from "@/lib/prisma";
import { StaffInviteForm } from "./staff-invite-form";
import { StaffToggleButton } from "./staff-toggle-button";
import { StaffDeleteDialog } from "./staff-delete-dialog";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export async function StaffCard({ gymId }: { gymId: string }) {
  const staff = await prisma.user.findMany({
    where: { gymId, role: "STAFF" },
    // passwordHash stays server-side — used only to derive the "pending" state,
    // never passed to a client component.
    select: { id: true, name: true, email: true, active: true, passwordHash: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-5">
      {staff.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Hələ işçi yoxdur.</p>
      ) : (
        <ul className="space-y-2">
          {staff.map((s) => {
            const pending = !s.active && s.passwordHash === "";
            return (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2.5"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 text-xs font-semibold text-[var(--brand-strong)]">
                  {initials(s.name) || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.name}</div>
                  <div className="truncate text-xs text-[var(--muted)]">{s.email}</div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    s.active
                      ? "bg-emerald-100 text-emerald-700"
                      : pending
                        ? "bg-amber-100 text-amber-700"
                        : "bg-neutral-200 text-neutral-600"
                  }`}
                >
                  {s.active ? "Aktiv" : pending ? "Dəvət gözlənilir" : "Deaktiv"}
                </span>
                <div className="flex shrink-0 items-center gap-3">
                  {!pending && <StaffToggleButton staffId={s.id} active={s.active} />}
                  <StaffDeleteDialog staffId={s.id} staffName={s.name} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-[var(--border)] pt-4">
        <h3 className="mb-2 text-sm font-medium">Yeni işçi əlavə et</h3>
        <StaffInviteForm />
      </div>
    </div>
  );
}
