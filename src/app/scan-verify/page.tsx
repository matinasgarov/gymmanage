import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { verifyScan } from "@/lib/scan-actions";
import { getT } from "@/lib/i18n-server";

// Hit when a phone's native camera app opens the QR's URL directly.
// We verify server-side and show the result inline.
export default async function ScanVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t: token } = await searchParams;
  if (!token) redirect("/scan");

  const [t, result] = await Promise.all([getT(), verifyScan(token)]);
  const granted = result.ok;

  return (
    <AppShell>
      <div
        className={`${granted ? "bg-green-600" : "bg-red-600"} text-white rounded-lg p-6 min-h-[50vh] flex flex-col items-center justify-center text-center`}
      >
        <div className="text-6xl mb-3">{granted ? "✓" : "✕"}</div>
        <div className="text-2xl font-semibold mb-1">
          {granted ? t("scanVerify.granted") : t("scanVerify.denied")}
        </div>
        {result.ok ? (
          <>
            <div className="text-lg">{result.member.name}</div>
            <div className="text-sm opacity-90">
              {result.member.publicId} · {t("scanVerify.expiry", { date: result.member.expiryDate })}
            </div>
          </>
        ) : (
          <>
            <div className="text-base opacity-95 mt-2">{result.reason}</div>
            {result.member && (
              <div className="text-sm opacity-90 mt-1">
                {result.member.name} · {result.member.publicId}
              </div>
            )}
          </>
        )}
      </div>
      <a href="/scan" className="block text-center text-sm text-blue-600 underline mt-4">
        {t("scanVerify.backToScanner")}
      </a>
    </AppShell>
  );
}
