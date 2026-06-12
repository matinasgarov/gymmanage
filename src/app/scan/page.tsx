import { ScanLine } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/dal";
import { getT } from "@/lib/i18n-server";
import { Scanner } from "@/components/scanner";
import { VisitorPassActions } from "@/components/visitor-pass-actions";

export default async function ScanPage() {
  const user = await getCurrentUser();
  const t = await getT();
  return (
    <AppShell>
      <PageHeader
        title={t("scan.title")}
        subtitle={t("scan.subtitle")}
        icon={ScanLine}
        tone="dark"
      />
      <div className="dash min-h-full px-4 lg:px-7 py-7 flex justify-center">
        <div className="w-full" style={{ maxWidth: 420 }}>
          <Scanner canOverride={user.role === "OWNER"} />
          {user.role === "OWNER" && <VisitorPassActions />}
        </div>
      </div>
    </AppShell>
  );
}
