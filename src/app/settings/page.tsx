import { Settings as SettingsIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { requireOwner } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { ProfileForm } from "@/components/settings/profile-form";
import { LogoForm } from "@/components/settings/logo-form";
import { TemplatesForm } from "@/components/settings/templates-form";
import { ScannerDevicesCard } from "@/components/scanner-devices-card";
import { StaffCard } from "@/components/settings/staff-card";

export default async function SettingsPage() {
  const user = await requireOwner();
  const gym = await prisma.gym.findUnique({
    where: { id: user.gymId },
  });
  if (!gym) return null;

  return (
    <AppShell>
      <PageHeader
        title="Tənzimləmələr"
        subtitle="Zal profili, loqo və WhatsApp mesaj şablonları"
        icon={SettingsIcon}
        tone="dark"
      />

      <div className="px-4 lg:px-8 py-6 space-y-6 max-w-2xl">
        <Section title="Açıq qeydiyyat linki">
          <p className="text-xs text-[var(--muted)] mb-2">
            Bu linki Instagram bio, WhatsApp statusu və ya əmlak agentlərinə paylaşın.
          </p>
          <code className="block text-xs text-[var(--brand-strong)] break-all">
            /join/{gym.id}
          </code>
        </Section>

        <Section title="Zalın loqosu">
          <LogoForm currentUrl={gym.logoUrl} gymName={gym.name} />
        </Section>

        <Section title="Zalın profili">
          <ProfileForm
            defaults={{
              name: gym.name,
              ownerName: gym.ownerName,
              phone: gym.phone,
              address: gym.address ?? "",
            }}
          />
        </Section>

        <Section title="Skanerlər">
          <ScannerDevicesCard />
        </Section>

        <Section title="İşçilər">
          <p className="text-xs text-[var(--muted)] mb-3">
            İşçi əlavə edin — onlara email ilə hesab aktivləşdirmə linki göndəriləcək.
          </p>
          <StaffCard gymId={gym.id} />
        </Section>

        <Section title="WhatsApp mesaj şablonları">
          <p className="text-xs text-[var(--muted)] mb-3">
            Boş saxlasanız ön təyin olunmuş Azərbaycanca mətn istifadə olunacaq.
            Yer tutucular: <code>{"{memberName}"}</code>, <code>{"{gymName}"}</code>,{" "}
            <code>{"{period}"}</code>, <code>{"{amount}"}</code>,{" "}
            <code>{"{expiryDate}"}</code>, <code>{"{daysLeft}"}</code>,{" "}
            <code>{"{passUrl}"}</code>
          </p>
          <TemplatesForm
            defaults={{
              waReminderTemplate: gym.waReminderTemplate ?? "",
              waReceiptTemplate: gym.waReceiptTemplate ?? "",
              waExpiringTemplate: gym.waExpiringTemplate ?? "",
              waWelcomeTemplate: gym.waWelcomeTemplate ?? "",
            }}
          />
        </Section>
      </div>
    </AppShell>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <h2 className="font-medium mb-3">{title}</h2>
      {children}
    </section>
  );
}
