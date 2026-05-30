import { notFound } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Dumbbell } from "lucide-react";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

function fmtTime(d: Date) {
  return d.toISOString().slice(11, 16);
}

export default async function VisitorPassPage({
  params,
}: {
  params: Promise<{ passId: string; token: string }>;
}) {
  const { passId, token } = await params;

  const pass = await prisma.visitorPass.findFirst({
    where: { id: passId, token },
    include: {
      gym: { select: { name: true, logoUrl: true } },
    },
  });
  if (!pass) notFound();

  const expired = pass.expiresAt.getTime() < Date.now();

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;
  // The QR encodes the canonical pass URL. Scanner extracts the token from
  // ?t= if present, else falls back to the string itself.
  const scanUrl = `${origin}/scan-verify?t=${encodeURIComponent(token)}`;

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-neutral-100">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-6 space-y-4">
        <header className="text-center">
          <div className="w-12 h-12 rounded-full bg-white shadow mx-auto flex items-center justify-center overflow-hidden mb-2">
            {pass.gym.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={pass.gym.logoUrl} alt={pass.gym.name} className="w-full h-full object-cover" />
            ) : (
              <Dumbbell className="w-5 h-5 text-[var(--brand)]" />
            )}
          </div>
          <h1 className="text-lg font-semibold">{pass.gym.name}</h1>
          <p className="text-xs text-neutral-500">Günlük qonaq kartı</p>
        </header>

        <div className="text-center">
          <p className="text-base font-medium">{pass.name ?? "Qonaq"}</p>
          <p className="text-xs text-neutral-500">
            {expired
              ? "QR vaxtı keçib"
              : `${fmtTime(pass.expiresAt)}-ə qədər keçərlidir`}
          </p>
        </div>

        {!expired && (
          <div className="flex justify-center">
            <div className="bg-white p-4 rounded-lg border">
              <QRCodeSVG value={scanUrl} size={240} level="M" marginSize={0} />
            </div>
          </div>
        )}

        <p className="text-[11px] text-neutral-400 text-center pt-2 border-t">
          Bu QR yalnız bu gün keçərlidir və saysız dəfə istifadə edilə bilər.
        </p>
      </div>
    </main>
  );
}
