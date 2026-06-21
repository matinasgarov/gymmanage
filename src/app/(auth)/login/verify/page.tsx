import { redirect } from "next/navigation";
import { getT } from "@/lib/i18n-server";
import { AuthShell } from "@/components/auth-shell";
import { readPending2FA } from "@/lib/session";
import { VerifyForm } from "./verify-form";

export default async function VerifyPage() {
  // No pending challenge → nothing to verify; send the user back to login.
  const pending = await readPending2FA();
  if (!pending) redirect("/login");

  const t = await getT();
  return (
    <AuthShell>
      <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px", color: "var(--d-tx)" }}>
        {t("auth.verifyTitle")}
      </h1>
      <p style={{ fontSize: 13, color: "var(--d-tx3)", marginTop: 4, marginBottom: 24 }}>
        {t("auth.verifySubtitle")}
      </p>
      <VerifyForm />
    </AuthShell>
  );
}
