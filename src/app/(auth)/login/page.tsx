import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const t = await getT();
  return (
    <AuthShell>
      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px", color: "var(--d-tx)" }}>
        {t("auth.loginTitle")}
      </h1>
      <p style={{ fontSize: 13, color: "var(--d-tx3)", marginTop: 4, marginBottom: 24 }}>
        {t("auth.loginSubtitle")}
      </p>
      <LoginForm />
      <p style={{ fontSize: 13, color: "var(--d-tx3)", marginTop: 20, textAlign: "center" }}>
        {t("auth.loginNewGym")}{" "}
        <Link href="/signup" style={{ color: "#3b7bf6", fontWeight: 700, textDecoration: "none" }}>
          {t("auth.loginRegister")}
        </Link>
      </p>
    </AuthShell>
  );
}
