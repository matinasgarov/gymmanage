import { UserPlus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { MemberForm } from "@/components/member-form";
import { getOwnerDb } from "@/lib/dal";
import { getT } from "@/lib/i18n-server";
import type { PlanType } from "@/generated/prisma/enums";

export default async function NewMemberPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string }>;
}) {
  const { db } = await getOwnerDb();
  const t = await getT();
  const { leadId } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);

  let leadPrefill: { name: string; phone: string; planType?: PlanType; notes: string } | null = null;
  if (leadId) {
    const lead = await db.lead.findFirst({
      where: { id: leadId, status: { not: "CONVERTED" } },
      select: { name: true, phone: true, interest: true, message: true },
    });
    if (lead) {
      leadPrefill = {
        name: lead.name,
        phone: lead.phone,
        planType: lead.interest ?? undefined,
        notes: lead.message ?? "",
      };
    }
  }

  return (
    <AppShell>
      <PageHeader
        title={leadPrefill ? t("memberForm.convertTitle") : t("memberForm.newTitle")}
        subtitle={leadPrefill ? t("memberForm.convertSubtitle") : t("memberForm.newSubtitle")}
        icon={UserPlus}
        tone="dark"
      />
      <div className="px-4 lg:px-8 py-6">
        <div className="card p-6 max-w-xl">
          <MemberForm
            mode="create"
            leadId={leadId}
            defaults={{
              name: leadPrefill?.name ?? "",
              phone: leadPrefill?.phone ?? "+994",
              email: "",
              planType: leadPrefill?.planType ?? "MONTHLY_UNLIMITED",
              planPrice: 50,
              startDate: today,
              notes: leadPrefill?.notes ?? "",
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}
