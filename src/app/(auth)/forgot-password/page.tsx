import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { ForgotForm } from "./forgot-form";

export default async function ForgotPasswordPage() {
  const t = await getT();
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-1">{t("auth.forgotTitle")}</h1>
        <p className="text-sm text-neutral-600 mb-6">{t("auth.forgotSubtitle")}</p>
        <ForgotForm />
        <p className="text-sm text-neutral-600 mt-4 text-center">
          <Link href="/login" className="text-blue-600 hover:underline">
            {t("auth.forgotBackToLogin")}
          </Link>
        </p>
      </div>
    </main>
  );
}
