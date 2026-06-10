import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { User as UserIcon, ChevronLeft, ExternalLink, Pencil, Snowflake, MessageCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
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
import { MEMBER_STATUS_COLOR as STATUS_COLOR } from "@/lib/labels";

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

  return (
    <AppShell>
      <PageHeader
        title={member.name}
        subtitle={`${member.publicId} · ${member.phone}`}
        icon={UserIcon}
        tone="dark"
        actions={
          <Link
            href={`/members/${member.id}/edit`}
            className="btn-ghost inline-flex items-center gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t("rowActions.edit")}</span>
          </Link>
        }
      />

      <div className="px-4 lg:px-8 py-6 space-y-4">
        <Link
          href="/members"
          className="inline-flex items-center text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <ChevronLeft className="w-4 h-4" /> {t("nav.members")}
        </Link>

        <section className="card p-5">
          <PhotoUpload
            memberId={member.id}
            currentUrl={member.photoUrl}
            memberName={member.name}
          />
        </section>

        <section className="card p-5 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <Info label={t("members.colStatus")}>
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[effStatus]}`}>
              {t(`status.${effStatus}`)}
            </span>
          </Info>
          <Info label={t("memberForm.plan")} value={t(`plan.${member.planType}`)} />
          <Info label={t("memberDetail.price")} value={formatAZN(member.planPrice)} />
          <Info label={t("memberDetail.start")} value={fmtDate(member.startDate)} />
          <Info label={t("members.colExpiry")} value={fmtDate(member.expiryDate)} />
          {member.email && <Info label="Email" value={member.email} />}
          {member.notes && (
            <div className="col-span-2 sm:col-span-3">
              <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{t("memberDetail.notes")}</div>
              <div className="text-sm">{member.notes}</div>
            </div>
          )}
        </section>

        <section className="card p-5">
          <h2 className="font-medium mb-3">{t("memberDetail.qrCard")}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={passUrl} target="_blank" className="btn-ghost inline-flex items-center gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" /> {t("memberDetail.openCard")}
            </Link>
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full px-4 py-2 text-sm font-medium"
            >
              <MessageCircle className="w-3.5 h-3.5" /> {t("memberDetail.sendWhatsapp")}
            </a>
          </div>
          <code className="block text-[11px] text-[var(--muted)] break-all mt-3">{passUrl}</code>
          {transferCount > 0 && (
            <p
              className={`text-[11px] mt-2 ${transferCount >= 5 ? "text-amber-600" : "text-[var(--muted)]"}`}
            >
              {t("memberDetail.transferred", { count: transferCount })}
              {lastTransfer ? ` · ${t("memberDetail.lastTransfer", { date: fmtDate(lastTransfer.createdAt) })}` : ""}
            </p>
          )}
        </section>

        <section className="card p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <h2 className="font-medium">{t("nav.payments")}</h2>
            <RenewButton memberId={member.id} expiryDate={member.expiryDate.toISOString()} />
          </div>
          {member.payments.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">{t("memberDetail.noPayments")}</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {member.payments.map((p) => {
                const eff = computeEffectiveStatus(p);
                const isPaid = eff === "PAID";
                return (
                  <li
                    key={p.id}
                    className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                  >
                    <div>
                      <div className="font-medium text-sm">
                        {formatPeriodLabel(p.dueDate, member.planType, locale)}
                      </div>
                      <div className="text-[11px] text-[var(--muted)]">
                        {formatAZN(p.amount)} ·{" "}
                        {isPaid
                          ? p.method
                            ? t("memberDetail.paidOnMethod", {
                                date: p.paidAt?.toISOString().slice(0, 10) ?? "",
                                method: t(`method.${p.method}`),
                              })
                            : t("memberDetail.paidOn", { date: p.paidAt?.toISOString().slice(0, 10) ?? "" })
                          : eff === "OVERDUE"
                            ? t("memberDetail.overdueOn", { date: p.dueDate.toISOString().slice(0, 10) })
                            : t("memberDetail.pendingOn", { date: p.dueDate.toISOString().slice(0, 10) })}
                      </div>
                    </div>
                    {isPaid ? (
                      <form action={unmarkPayment.bind(null, p.id)}>
                        <button className="text-xs text-[var(--muted)] underline">
                          {t("memberDetail.undo")}
                        </button>
                      </form>
                    ) : (
                      <form
                        action={markPaymentPaid.bind(null, p.id)}
                        className="flex items-center gap-2"
                      >
                        <select
                          name="method"
                          defaultValue="CASH"
                          className="border border-[var(--border)] rounded-md px-2 py-1 text-sm bg-white"
                        >
                          <option value="CASH">{t("method.CASH")}</option>
                          <option value="CARD">{t("method.CARD")}</option>
                          <option value="TRANSFER">{t("method.TRANSFER")}</option>
                        </select>
                        <button className="bg-emerald-500 hover:bg-emerald-600 text-white text-sm rounded-full px-3 py-1.5">
                          {t("memberDetail.markPaid")}
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="font-medium mb-3 flex items-center gap-2">
            <Snowflake className="w-4 h-4 text-sky-600" /> {t("memberDetail.freeze")}
          </h2>
          <form action={freezeAction} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input
              type="date"
              name="startDate"
              defaultValue={today}
              required
              className="px-3 py-2 border border-[var(--border)] rounded-md text-sm"
            />
            <input
              type="date"
              name="endDate"
              required
              className="px-3 py-2 border border-[var(--border)] rounded-md text-sm"
            />
            <input
              type="text"
              name="reason"
              placeholder={t("memberDetail.reasonPlaceholder")}
              className="px-3 py-2 border border-[var(--border)] rounded-md text-sm sm:col-span-1"
            />
            <button
              type="submit"
              className="bg-sky-600 hover:bg-sky-700 text-white rounded-full px-3 py-2 text-sm font-medium"
            >
              {t("memberDetail.freezeSubmit")}
            </button>
          </form>
          {member.freezes.length > 0 && (
            <ul className="mt-3 text-sm text-[var(--muted)] space-y-1">
              {member.freezes.map((f) => (
                <li key={f.id}>
                  {fmtDate(f.startDate)} → {fmtDate(f.endDate)}
                  {f.reason ? ` · ${f.reason}` : ""}
                </li>
              ))}
            </ul>
          )}
        </section>

        {member.status === "CANCELLED" && member.cancelReason && (
          <section className="card p-5 border-red-100 bg-red-50/40">
            <h2 className="font-medium text-red-800 mb-1">{t("memberDetail.cancelInfo")}</h2>
            <p className="text-sm">
              <span className="text-[var(--muted)]">{t("memberDetail.reasonLabel")}</span>{" "}
              <span className="font-medium">
                {t(`cancelReason.${member.cancelReason}`)}
              </span>
              {member.cancelledAt && (
                <span className="text-[var(--muted)]">
                  {" "}
                  · {fmtDate(member.cancelledAt)}
                </span>
              )}
            </p>
            {member.cancelNote && (
              <p className="text-sm text-[var(--muted)] mt-1">
                {member.cancelNote}
              </p>
            )}
          </section>
        )}

        <section className="flex items-center gap-2 pt-2">
          {member.status !== "CANCELLED" ? (
            <CancelDialog memberId={member.id} />
          ) : (
            <form action={reactivateAction}>
              <button className="px-4 py-2 border border-emerald-200 text-emerald-700 rounded-full text-sm hover:bg-emerald-50">
                {t("memberDetail.reactivate")}
              </button>
            </form>
          )}
          <div className="ml-auto">
            <DeleteMemberDialog memberId={member.id} memberName={member.name} />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Info({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="mt-0.5 font-medium text-sm">{children ?? value}</div>
    </div>
  );
}
