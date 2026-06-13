import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import {
  ChevronLeft,
  ExternalLink,
  Pencil,
  Snowflake,
  MessageCircle,
  CreditCard,
  LayoutGrid,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getGymDb } from "@/lib/dal";
import { getT, getLocale } from "@/lib/i18n-server";
import { formatAZN } from "@/lib/members";
import {
  freezeMember,
  reactivateMember,
} from "@/lib/member-actions";
import { signPassUrlToken, buildPassUrl } from "@/lib/qr";
import { effectiveMemberStatus } from "@/lib/members-format";
import {
  ensurePendingPayments,
  formatPeriodLabel,
  computeEffectiveStatus,
} from "@/lib/payments";
import { markPaymentPaid, unmarkPayment } from "@/lib/payment-actions";
import { RenewButton } from "@/components/renew-button";
import { CancelDialog } from "@/components/cancel-dialog";
import { DeleteMemberDialog } from "@/components/delete-member-dialog";
import { PhotoUpload } from "@/components/photo-upload";
import { buildWaUrl, pickTemplate, renderTemplate } from "@/lib/templates";

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, db } = await getGymDb();
  const t = await getT();
  const locale = await getLocale();
  const { id } = await params;

  await ensurePendingPayments(id);

  const member = await db.member.findFirst({
    where: { id },
    include: {
      freezes: { orderBy: { startDate: "desc" }, take: 5 },
      payments: { orderBy: { dueDate: "desc" }, take: 24 },
    },
  });

  if (!member) notFound();

  // Stored status never flips to EXPIRED; derive it from expiryDate for display.
  const effStatus = effectiveMemberStatus(member);

  // Passive anti-sharing signal: how often this pass has been moved to a new
  // device (each transfer is phone-verified + logged). Derived from audit rows.
  const transferWhere = {
    action: "pass.device_transfer",
    entityType: "Member",
    entityId: member.id,
  };
  const transferCount = await db.auditLog.count({ where: transferWhere });
  const lastTransfer =
    transferCount > 0
      ? await db.auditLog.findFirst({
          where: transferWhere,
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        })
      : null;

  const freezeAction = freezeMember.bind(null, member.id);
  const reactivateAction = reactivateMember.bind(null, member.id);
  const today = new Date().toISOString().slice(0, 10);

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;
  const urlToken = signPassUrlToken(member.id, member.qrSecret);
  const passUrl = buildPassUrl(member.id, urlToken, origin);
  const welcomeMsg = renderTemplate(
    pickTemplate("welcome", user.gym.waWelcomeTemplate),
    { memberName: member.name, gymName: user.gym.name, passUrl }
  );
  const waUrl = buildWaUrl(member.phone, welcomeMsg);

  const statusClass = `md-s-${effStatus.toLowerCase()}`;

  return (
    <AppShell>
      <div
        className="dash min-h-full px-4 lg:px-7 py-6"
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        <Link href="/members" className="md-back">
          <ChevronLeft className="w-3.5 h-3.5" /> {t("nav.members")}
        </Link>

        {/* Hero */}
        <div className="md-hero">
          <PhotoUpload
            memberId={member.id}
            currentUrl={member.photoUrl}
            memberName={member.name}
          />
          <div className="md-hero-info">
            <div className="md-hero-name">{member.name}</div>
            <div className="md-hero-meta">
              <span className="md-hero-id">{member.publicId}</span>
              <span className="md-sep" />
              <span className="md-hero-phone">{member.phone}</span>
              <span className={`md-badge ${statusClass}`}>{t(`status.${effStatus}`)}</span>
            </div>
          </div>
          <Link href={`/members/${member.id}/edit`} className="md-edit-btn">
            <Pencil className="w-3.5 h-3.5" /> {t("rowActions.edit")}
          </Link>
        </div>

        {/* Two-column grid */}
        <div className="md-grid">
          {/* LEFT */}
          <div className="md-col">
            {/* Membership */}
            <div className="md-card">
              <div className="md-card-head">
                <div className="md-card-title-row">
                  <div className="md-card-ico" style={{ background: "rgba(59,123,246,.12)", color: "#3b7bf6" }}>
                    <CreditCard className="w-3.5 h-3.5" />
                  </div>
                  <span className="md-card-title">{t("memberDetail.membership")}</span>
                </div>
              </div>
              <div className="md-mem-grid">
                <div className="md-mem-cell">
                  <span className="md-mem-label">{t("members.colStatus")}</span>
                  <span className={`md-badge ${statusClass}`} style={{ width: "fit-content", marginTop: 3 }}>
                    {t(`status.${effStatus}`)}
                  </span>
                </div>
                <div className="md-mem-cell">
                  <span className="md-mem-label">{t("memberForm.plan")}</span>
                  <span className="md-mem-value">{t(`plan.${member.planType}`)}</span>
                </div>
                <div className="md-mem-cell">
                  <span className="md-mem-label">{t("memberDetail.price")}</span>
                  <span className="md-mem-value">{formatAZN(member.planPrice)}</span>
                </div>
              </div>
              <div className="md-mem-row2">
                <div className="md-mem-cell">
                  <span className="md-mem-label">{t("memberDetail.start")}</span>
                  <span className="md-mem-value">{fmtDate(member.startDate)}</span>
                </div>
                <div className="md-mem-cell">
                  <span className="md-mem-label">{t("members.colExpiry")}</span>
                  <span className="md-mem-value">{fmtDate(member.expiryDate)}</span>
                </div>
              </div>
              {(member.email || member.notes) && (
                <div style={{ padding: "14px 22px", borderTop: "1px solid var(--d-bdr)", display: "flex", flexDirection: "column", gap: 8 }}>
                  {member.email && (
                    <div>
                      <span className="md-mem-label">Email</span>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--d-tx)", marginTop: 2 }}>{member.email}</div>
                    </div>
                  )}
                  {member.notes && (
                    <div>
                      <span className="md-mem-label">{t("memberDetail.notes")}</span>
                      <div style={{ fontSize: 13, color: "var(--d-tx2)", marginTop: 2 }}>{member.notes}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Payments */}
            <div className="md-card">
              <div className="md-card-head">
                <div className="md-card-title-row">
                  <div className="md-card-ico" style={{ background: "rgba(16,185,129,.12)", color: "#10b981" }}>
                    <CreditCard className="w-3.5 h-3.5" />
                  </div>
                  <span className="md-card-title">{t("nav.payments")}</span>
                </div>
                <RenewButton memberId={member.id} expiryDate={member.expiryDate.toISOString()} />
              </div>
              <div className="md-card-body">
                {member.payments.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--d-tx3)", fontWeight: 500 }}>{t("memberDetail.noPayments")}</p>
                ) : (
                  member.payments.map((p) => {
                    const eff = computeEffectiveStatus(p);
                    const isPaid = eff === "PAID";
                    const meta = isPaid
                      ? p.method
                        ? t("memberDetail.paidOnMethod", {
                            date: p.paidAt?.toISOString().slice(0, 10) ?? "",
                            method: t(`method.${p.method}`),
                          })
                        : t("memberDetail.paidOn", { date: p.paidAt?.toISOString().slice(0, 10) ?? "" })
                      : eff === "OVERDUE"
                        ? t("memberDetail.overdueOn", { date: p.dueDate.toISOString().slice(0, 10) })
                        : t("memberDetail.pendingOn", { date: p.dueDate.toISOString().slice(0, 10) });
                    return (
                      <div key={p.id} className="md-pay-item">
                        <div
                          className="md-pay-ico"
                          style={
                            isPaid
                              ? { background: "rgba(16,185,129,.12)", color: "#10b981" }
                              : eff === "OVERDUE"
                                ? { background: "rgba(239,68,68,.1)", color: "#ef4444" }
                                : { background: "rgba(245,158,11,.12)", color: "#f59e0b" }
                          }
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                        </div>
                        <div className="md-pay-info">
                          <div className="md-pay-month">{formatPeriodLabel(p.dueDate, member.planType, locale)}</div>
                          <div className="md-pay-meta">{formatAZN(p.amount)} · {meta}</div>
                        </div>
                        <div className="md-pay-right">
                          {isPaid ? (
                            <>
                              <span className="md-pb md-pb-paid">{t("paymentStatus.PAID")}</span>
                              <form action={unmarkPayment.bind(null, p.id)}>
                                <button className="md-undo">{t("memberDetail.undo")}</button>
                              </form>
                            </>
                          ) : (
                            <form action={markPaymentPaid.bind(null, p.id)} className="flex items-center gap-2">
                              <select name="method" defaultValue="CASH" className="md-select">
                                <option value="CASH">{t("method.CASH")}</option>
                                <option value="CARD">{t("method.CARD")}</option>
                                <option value="TRANSFER">{t("method.TRANSFER")}</option>
                              </select>
                              <button className="md-mark-paid">{t("memberDetail.markPaid")}</button>
                            </form>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="md-col">
            {/* QR pass */}
            <div className="md-card">
              <div className="md-card-head">
                <div className="md-card-title-row">
                  <div className="md-card-ico" style={{ background: "rgba(139,92,246,.1)", color: "#8b5cf6" }}>
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </div>
                  <span className="md-card-title">{t("memberDetail.qrCard")}</span>
                </div>
              </div>
              <div className="md-card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <Link href={passUrl} target="_blank" className="md-qr-btn md-qr-open">
                    <ExternalLink className="w-3 h-3" /> {t("memberDetail.openCard")}
                  </Link>
                  <a href={waUrl} target="_blank" rel="noopener noreferrer" className="md-qr-btn md-qr-wa">
                    <MessageCircle className="w-3 h-3" /> {t("memberDetail.sendWhatsapp")}
                  </a>
                </div>
                <a href={passUrl} target="_blank" rel="noopener noreferrer" className="md-qr-url">
                  {passUrl}
                </a>
                {transferCount > 0 && (
                  <p style={{ fontSize: 11, marginTop: 2, color: transferCount >= 5 ? "#f59e0b" : "var(--d-tx3)", fontWeight: 500 }}>
                    {t("memberDetail.transferred", { count: transferCount })}
                    {lastTransfer ? ` · ${t("memberDetail.lastTransfer", { date: fmtDate(lastTransfer.createdAt) })}` : ""}
                  </p>
                )}
              </div>
            </div>

            {/* Freeze */}
            <div className="md-card">
              <div className="md-card-head">
                <div className="md-card-title-row">
                  <div className="md-card-ico" style={{ background: "rgba(6,182,212,.15)", color: "#06b6d4" }}>
                    <Snowflake className="w-3.5 h-3.5" />
                  </div>
                  <span className="md-card-title">{t("memberDetail.freeze")}</span>
                </div>
              </div>
              <div className="md-card-body">
                <form action={freezeAction}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span className="md-field-label">{t("memberDetail.start")}</span>
                      <input type="date" name="startDate" defaultValue={today} required className="md-input" />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span className="md-field-label">{t("members.colExpiry")}</span>
                      <input type="date" name="endDate" required className="md-input" />
                    </div>
                  </div>
                  <input
                    type="text"
                    name="reason"
                    placeholder={t("memberDetail.reasonPlaceholder")}
                    className="md-input"
                    style={{ marginTop: 8 }}
                  />
                  <button type="submit" className="md-btn-freeze" style={{ marginTop: 10 }}>
                    <Snowflake className="w-3.5 h-3.5" /> {t("memberDetail.freezeSubmit")}
                  </button>
                </form>
                {member.freezes.length > 0 && (
                  <ul style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                    {member.freezes.map((f) => (
                      <li key={f.id} style={{ fontSize: 11.5, color: "var(--d-tx3)", fontWeight: 500 }}>
                        {fmtDate(f.startDate)} → {fmtDate(f.endDate)}
                        {f.reason ? ` · ${f.reason}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Cancel info */}
        {member.status === "CANCELLED" && member.cancelReason && (
          <div className="md-card" style={{ background: "rgba(239,68,68,.04)" }}>
            <div style={{ padding: "16px 22px" }}>
              <h2 style={{ fontSize: 14, fontWeight: 800, color: "#ef4444", marginBottom: 4 }}>{t("memberDetail.cancelInfo")}</h2>
              <p style={{ fontSize: 13 }}>
                <span style={{ color: "var(--d-tx3)" }}>{t("memberDetail.reasonLabel")}</span>{" "}
                <span style={{ fontWeight: 700, color: "var(--d-tx)" }}>{t(`cancelReason.${member.cancelReason}`)}</span>
                {member.cancelledAt && <span style={{ color: "var(--d-tx3)" }}> · {fmtDate(member.cancelledAt)}</span>}
              </p>
              {member.cancelNote && (
                <p style={{ fontSize: 12.5, color: "var(--d-tx3)", marginTop: 4 }}>{member.cancelNote}</p>
              )}
            </div>
          </div>
        )}

        {/* Danger row */}
        <div className="md-danger">
          <span className="md-danger-hint">{t("memberDetail.dangerHint")}</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {member.status !== "CANCELLED" ? (
              <CancelDialog memberId={member.id} />
            ) : (
              <form action={reactivateAction}>
                <button className="md-btn-reactivate">{t("memberDetail.reactivate")}</button>
              </form>
            )}
            <DeleteMemberDialog memberId={member.id} memberName={member.name} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
