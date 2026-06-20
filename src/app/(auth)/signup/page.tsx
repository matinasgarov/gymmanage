import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const t = await getT();
  return (
    <AuthShell>
      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px", color: "var(--d-tx)" }}>
        {t("auth.signupTitle")}
      </h1>
      <p style={{ fontSize: 13, color: "var(--d-tx3)", marginTop: 4, marginBottom: 24 }}>
        {t("auth.signupSubtitle")}
      </p>
      <SignupForm />
      <p style={{ fontSize: 13, color: "var(--d-tx3)", marginTop: 20, textAlign: "center" }}>
        {t("auth.signupHaveAccount")}{" "}
        <Link href="/login" style={{ color: "#3b7bf6", fontWeight: 700, textDecoration: "none" }}>
          {t("auth.signupLogin")}
        </Link>
      </p>
    </AuthShell>
  );
}
