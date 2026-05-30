import { ScanLine } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/dal";
import { Scanner } from "@/components/scanner";
import { VisitorPassActions } from "@/components/visitor-pass-actions";

export default async function ScanPage() {
  const user = await getCurrentUser();
  return (
    <AppShell>
      <PageHeader
        title="QR Skaner"
        subtitle="Üzv kartını kamera ilə oxudun"
        icon={ScanLine}
        tone="dark"
      />
      <div className="px-4 lg:px-8 py-6">
        <div className="max-w-md mx-auto">
          <Scanner canOverride={user.role === "OWNER"} />
          {user.role === "OWNER" && <VisitorPassActions />}
        </div>
      </div>
    </AppShell>
  );
}
