import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n-server";
import { AuthShell } from "@/components/auth-shell";
import { readPendingSignup } from "@/lib/session";
import { SignupVerifyForm } from "./verify-form";

export default async function SignupVerifyPage() {
  // No pending signup → nothing to verify; send the user back to signup.
  const pending = await readPendingSignup();
  if (!pending) redirect("/signup");

  const t = await getT();
  return (
    <AuthShell>
      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px", color: "var(--d-tx)" }}>
        {t("auth.signupVerifyTitle")}
      </h1>
      <p style={{ fontSize: 13, color: "var(--d-tx3)", marginTop: 4, marginBottom: 4 }}>
        {t("auth.signupVerifySubtitle")}
      </p>
      <p style={{ fontSize: 13, fontWeight: 700, color: "var(--d-tx)", marginBottom: 24 }}>
        {pending.email}
      </p>
      <SignupVerifyForm />
    </AuthShell>
  );
}
