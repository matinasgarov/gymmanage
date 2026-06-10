import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { AcceptForm } from "./accept-form";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const t = await getT();

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-1">{t("auth.acceptTitle")}</h1>
        {token ? (
          <>
            <p className="text-sm text-neutral-600 mb-6">{t("auth.acceptSubtitle")}</p>
            <AcceptForm token={token} />
          </>
        ) : (
          <p className="text-sm text-red-600 mb-6">
            {t("auth.acceptInvalidLink")}{" "}
            <Link href="/login" className="text-blue-600 hover:underline">
              {t("auth.acceptBackToLogin")}
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
