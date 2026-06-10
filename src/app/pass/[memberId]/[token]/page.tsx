import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassUrlToken } from "@/lib/qr";
import { formatAZN } from "@/lib/members";
import { RotatingQR } from "@/components/rotating-qr";
import { getT } from "@/lib/i18n-server";
import { ensurePendingPayments, computeDebt } from "@/lib/payments";
import { buildWaUrl } from "@/lib/templates";
import { isLocale, DEFAULT_LOCALE } from "@/lib/i18n";

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  OVERDUE: "bg-orange-100 text-orange-800",
  FROZEN: "bg-blue-100 text-blue-800",
  EXPIRED: "bg-neutral-200 text-neutral-700",
  CANCELLED: "bg-red-100 text-red-800",
};

export default async function MemberPassPage({
  params,
}: {
  params: Promise<{ memberId: string; token: string }>;
}) {
  const { memberId, token } = await params;
  const t = await getT();

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      gym: { select: { name: true, logoUrl: true, phone: true, locale: true } },
    },
  });

  if (!member) notFound();
  if (!verifyPassUrlToken(member.id, member.qrSecret, token)) notFound();

  await ensurePendingPayments(member.id);
  const now = new Date();
  const unpaidRows = await prisma.payment.findMany({
    where: {
      memberId: member.id,
      status: { not: "PAID" },
      paidAt: null,
      dueDate: { lte: now },
    },
    select: { status: true, dueDate: true, paidAt: true, amount: true },
  });
  const gymLocale = isLocale(member.gym.locale) ? member.gym.locale : DEFAULT_LOCALE;
  const debt = computeDebt(
    unpaidRows.map((r) => ({ ...r, amount: Number(r.amount.toString()) })),
    member.planType,
    gymLocale,
    now
  );
  const daysToExpiry = Math.ceil((member.expiryDate.getTime() - now.getTime()) / 86_400_000);
  const showExpirySoon = !debt && daysToExpiry >= 0 && daysToExpiry <= 7;
  const waUrl = member.gym.phone
    ? buildWaUrl(
        member.gym.phone,
        t("pass.renewMessage", { gymName: member.gym.name, publicId: member.publicId })
      )
    : null;

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-neutral-100">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6 space-y-4">
        <header className="text-center">
          <h1 className="text-lg font-semibold">{member.gym.name}</h1>
          <p className="text-xs text-neutral-500">{t("pass.memberCard")}</p>
        </header>

        {(debt || showExpirySoon) && (
          <div
            className={`rounded-lg px-4 py-3 text-sm border ${
              debt
                ? "bg-amber-50 text-amber-900 border-amber-200"
                : "bg-blue-50 text-blue-900 border-blue-200"
            }`}
          >
            <p className="font-medium">
              {debt
                ? t("pass.debtBanner", {
                    amount: debt.amount.toFixed(2),
                    period: debt.periodLabel,
                  })
                : t("pass.expiresSoon", { count: daysToExpiry })}
            </p>
            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center justify-center w-full rounded-full bg-emerald-500 hover:bg-emerald-600 text-white py-2 text-sm font-semibold"
              >
                {t("pass.contactGym")}
              </a>
            )}
          </div>
        )}

        <div className="flex flex-col items-center">
          {member.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={member.photoUrl}
              alt={member.name}
              className="w-16 h-16 rounded-full object-cover mb-2"
            />
          ) : null}
          <p className="text-base font-medium">{member.name}</p>
          <p className="text-xs text-neutral-500">{member.publicId}</p>
        </div>

        <div className="flex justify-center">
          <RotatingQR memberId={member.id} urlToken={token} />
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Info label={t("pass.status")}>
            <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLOR[member.status]}`}>
              {t(`status.${member.status}`)}
            </span>
          </Info>
          <Info label={t("pass.plan")}>
            <span>{t(`plan.${member.planType}`)}</span>
          </Info>
          <Info label={t("pass.price")}>
            <span>{formatAZN(member.planPrice)}</span>
          </Info>
          <Info label={t("pass.expiry")}>
            <span>{member.expiryDate.toISOString().slice(0, 10)}</span>
          </Info>
        </div>

        <p className="text-[11px] text-neutral-400 text-center pt-2 border-t">
          {t("pass.addToHomeHint")}
        </p>
      </div>
    </main>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
