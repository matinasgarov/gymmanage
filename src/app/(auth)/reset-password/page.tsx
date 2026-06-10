import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const t = await getT();

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-1">{t("auth.resetTitle")}</h1>
        {token ? (
          <>
            <p className="text-sm text-neutral-600 mb-6">{t("auth.resetSubtitle")}</p>
            <ResetForm token={token} />
          </>
        ) : (
          <p className="text-sm text-red-600 mb-6">
            {t("auth.resetInvalidLink")}{" "}
            <Link href="/forgot-password" className="text-blue-600 hover:underline">
              {t("auth.resetTryAgain")}
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
