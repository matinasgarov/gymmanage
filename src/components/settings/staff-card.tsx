import { prisma } from "@/lib/prisma";
import { getT } from "@/lib/i18n-server";
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
  const t = await getT();
  const staff = await prisma.user.findMany({
    where: { gymId, role: "STAFF" },
    select: { id: true, name: true, email: true, active: true, passwordHash: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {staff.length === 0 ? (
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--d-tx3)" }}>{t("settings.staffNoStaff")}</p>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {staff.map((s) => {
            const pending = !s.active && s.passwordHash === "";
            const statusLabel = s.active
              ? t("settings.staffActive")
              : pending
                ? t("settings.staffPending")
                : t("settings.staffInactive");
            const badgeCls = s.active ? "md-s-active" : pending ? "md-s-overdue" : "md-s-cancelled";
            return (
              <li
                key={s.id}
                className="flex items-center gap-3"
                style={{
                  border: "1px solid var(--d-bdr)",
                  borderRadius: 12,
                  padding: "10px 14px",
                  background: "var(--d-bg)",
                }}
              >
                <div
                  className="flex shrink-0 items-center justify-center"
                  style={{
                    height: 36,
                    width: 36,
                    borderRadius: "50%",
                    background: "rgba(59,123,246,.12)",
                    color: "#3b7bf6",
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  {initials(s.name) || "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate" style={{ fontSize: 13.5, fontWeight: 700, color: "var(--d-tx)" }}>{s.name}</div>
                  <div className="truncate" style={{ fontSize: 11.5, fontWeight: 500, color: "var(--d-tx3)" }}>{s.email}</div>
                </div>
                <span className={`md-badge ${badgeCls} shrink-0`}>{statusLabel}</span>
                <div className="flex shrink-0 items-center gap-3">
                  {!pending && <StaffToggleButton staffId={s.id} active={s.active} />}
                  <StaffDeleteDialog staffId={s.id} staffName={s.name} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div style={{ borderTop: "1px solid var(--d-bdr)", paddingTop: 16 }}>
        <h3 style={{ marginBottom: 12, fontSize: 13, fontWeight: 800, color: "var(--d-tx)" }}>{t("settings.staffAddTitle")}</h3>
        <StaffInviteForm />
      </div>
    </div>
  );
}
