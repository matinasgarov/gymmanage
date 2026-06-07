import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassUrlToken } from "@/lib/qr";
import { formatAZN } from "@/lib/members";
import { RotatingQR } from "@/components/rotating-qr";
import { PLAN_LABEL } from "@/config/gym-plans";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Aktiv",
  OVERDUE: "Borclu",
  FROZEN: "Donduruldu",
  EXPIRED: "Bitib",
  CANCELLED: "Ləğv edilib",
};

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

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: {
      gym: { select: { name: true, logoUrl: true } },
    },
  });

  if (!member) notFound();
  if (!verifyPassUrlToken(member.id, member.qrSecret, token)) notFound();

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-neutral-100">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6 space-y-4">
        <header className="text-center">
          <h1 className="text-lg font-semibold">{member.gym.name}</h1>
          <p className="text-xs text-neutral-500">Üzv kartı</p>
        </header>

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
          <Info label="Status">
            <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLOR[member.status]}`}>
              {STATUS_LABEL[member.status]}
            </span>
          </Info>
          <Info label="Plan">
            <span>{PLAN_LABEL[member.planType]}</span>
          </Info>
          <Info label="Qiymət">
            <span>{formatAZN(member.planPrice)}</span>
          </Info>
          <Info label="Bitmə">
            <span>{member.expiryDate.toISOString().slice(0, 10)}</span>
          </Info>
        </div>

        <p className="text-[11px] text-neutral-400 text-center pt-2 border-t">
          Bu səhifəni əlavə etmək üçün brauzerdə "Ana ekrana əlavə et" funksiyasından istifadə edin.
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
