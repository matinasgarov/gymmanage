import { prisma } from "@/lib/prisma";
import { StaffInviteForm } from "./staff-invite-form";
import { StaffToggleButton } from "./staff-toggle-button";

export async function StaffCard({ gymId }: { gymId: string }) {
  const staff = await prisma.user.findMany({
    where: { gymId, role: "STAFF" },
    select: { id: true, name: true, email: true, active: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-4">
      {staff.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Hələ işçi yoxdur.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {staff.map((s) => (
            <li key={s.id} className="py-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">{s.name}</div>
                <div className="text-xs text-[var(--muted)]">{s.email}</div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    s.active
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-neutral-200 text-neutral-600"
                  }`}
                >
                  {s.active ? "Aktiv" : "Deaktiv"}
                </span>
                <StaffToggleButton staffId={s.id} active={s.active} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <StaffInviteForm />
    </div>
  );
}
