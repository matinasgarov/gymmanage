import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getGymDb } from "@/lib/dal";
import { getT } from "@/lib/i18n-server";
import { MemberForm } from "@/components/member-form";

export default async function EditMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { db } = await getGymDb();
  const t = await getT();
  const { id } = await params;

  const member = await db.member.findFirst({
    where: { id },
  });
  if (!member) notFound();

  return (
    <AppShell>
      <PageHeader
        title={t("memberForm.editTitle", { name: member.name })}
        subtitle={member.publicId}
        icon={Pencil}
        tone="dark"
      />
      <div className="px-4 lg:px-8 py-6">
        <div className="card p-6 max-w-xl">
          <MemberForm
            mode="edit"
            memberId={member.id}
            defaults={{
              name: member.name,
              phone: member.phone,
              email: member.email ?? "",
              planType: member.planType,
              planPrice: Number(member.planPrice.toString()),
              startDate: member.startDate.toISOString().slice(0, 10),
              notes: member.notes ?? "",
              unlimitedEntries: member.unlimitedEntries,
            }}
          />
        </div>
      </div>
    </AppShell>
  );
}
