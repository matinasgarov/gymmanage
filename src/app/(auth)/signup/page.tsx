import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const t = await getT();
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-1">{t("auth.signupTitle")}</h1>
        <p className="text-sm text-neutral-600 mb-6">{t("auth.signupSubtitle")}</p>
        <SignupForm />
        <p className="text-sm text-neutral-600 mt-4 text-center">
          {t("auth.signupHaveAccount")}{" "}
          <Link href="/login" className="text-blue-600 hover:underline">
            {t("auth.signupLogin")}
          </Link>
        </p>
      </div>
    </main>
  );
}
