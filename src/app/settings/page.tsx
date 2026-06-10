import { Settings as SettingsIcon } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { requireOwner } from "@/lib/dal";
import { getT } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { ProfileForm } from "@/components/settings/profile-form";
import { LogoForm } from "@/components/settings/logo-form";
import { TemplatesForm } from "@/components/settings/templates-form";
import { ScannerDevicesCard } from "@/components/scanner-devices-card";
import { StaffCard } from "@/components/settings/staff-card";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default async function SettingsPage() {
  const user = await requireOwner();
  const t = await getT();
  const gym = await prisma.gym.findUnique({ where: { id: user.gymId } });
  if (!gym) return null;

  return (
    <AppShell>
      <PageHeader
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
        icon={SettingsIcon}
        tone="dark"
      />

      <div className="px-4 lg:px-8 py-6 space-y-6 max-w-2xl">
        <Section title={t("settings.sectionLanguage")}>
          <p className="text-xs text-[var(--muted)] mb-3">{t("settings.languageHint")}</p>
          <LocaleSwitcher />
        </Section>

        <Section title={t("settings.sectionJoinLink")}>
          <p className="text-xs text-[var(--muted)] mb-2">{t("settings.joinLinkHint")}</p>
          <code className="block text-xs text-[var(--brand-strong)] break-all">
            /join/{gym.id}
          </code>
        </Section>

        <Section title={t("settings.sectionLogo")}>
          <LogoForm currentUrl={gym.logoUrl} gymName={gym.name} />
        </Section>

        <Section title={t("settings.sectionProfile")}>
          <ProfileForm
            defaults={{
              name: gym.name,
              ownerName: gym.ownerName,
              phone: gym.phone,
              address: gym.address ?? "",
            }}
          />
        </Section>

        <Section title={t("settings.sectionScanners")}>
          <ScannerDevicesCard />
        </Section>

        <Section title={t("settings.sectionStaff")}>
          <p className="text-xs text-[var(--muted)] mb-3">{t("settings.staffHint")}</p>
          <StaffCard gymId={gym.id} />
        </Section>

        <Section title={t("settings.sectionTemplates")}>
          <p className="text-xs text-[var(--muted)] mb-3">
            {t("settings.templatesHint")}{" "}
            {t("settings.templatePlaceholders")}{" "}
            <code>{"{memberName}"}</code>, <code>{"{gymName}"}</code>,{" "}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="font-medium mb-3">{title}</h2>
      {children}
    </section>
  );
}
