import {
  Settings as SettingsIcon,
  Languages,
  LinkIcon,
  ImageIcon,
  Building2,
  ScanLine,
  Users,
  MessageSquare,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
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
import { TwoFactorForm } from "@/components/settings/two-factor-form";
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

      <div className="dash min-h-full px-4 lg:px-7 py-6">
        <div style={{ maxWidth: 720, display: "flex", flexDirection: "column", gap: 16 }}>
          <Section
            icon={Languages}
            color="#3b7bf6"
            bg="rgba(59,123,246,.12)"
            title={t("settings.sectionLanguage")}
            subtitle={t("settings.languageHint")}
          >
            <LocaleSwitcher />
          </Section>

          <Section
            icon={LinkIcon}
            color="#06b6d4"
            bg="rgba(6,182,212,.15)"
            title={t("settings.sectionJoinLink")}
            subtitle={t("settings.joinLinkHint")}
          >
            <code
              style={{
                display: "block",
                fontSize: 12.5,
                fontWeight: 700,
                color: "#3b7bf6",
                background: "var(--d-bg)",
                border: "1px solid var(--d-bdr)",
                borderRadius: 10,
                padding: "10px 12px",
                wordBreak: "break-all",
              }}
            >
              /join/{gym.id}
            </code>
          </Section>

          <Section
            icon={ImageIcon}
            color="#8b5cf6"
            bg="rgba(139,92,246,.12)"
            title={t("settings.sectionLogo")}
          >
            <LogoForm currentUrl={gym.logoUrl} gymName={gym.name} />
          </Section>

          <Section
            icon={ShieldCheck}
            color="#10b981"
            bg="rgba(16,185,129,.12)"
            title={t("twoFactor.sectionTitle")}
            subtitle={t("twoFactor.sectionHint")}
          >
            <TwoFactorForm enabled={user.twoFactorEnabled} />
          </Section>

          <Section
            icon={Building2}
            color="#3b7bf6"
            bg="rgba(59,123,246,.12)"
            title={t("settings.sectionProfile")}
          >
            <ProfileForm
              defaults={{
                name: gym.name,
                ownerName: gym.ownerName,
                phone: gym.phone,
                address: gym.address ?? "",
              }}
            />
          </Section>

          <Section
            icon={ScanLine}
            color="#06b6d4"
            bg="rgba(6,182,212,.15)"
            title={t("settings.sectionScanners")}
          >
            <ScannerDevicesCard />
          </Section>

          <Section
            icon={Users}
            color="#f59e0b"
            bg="rgba(245,158,11,.12)"
            title={t("settings.sectionStaff")}
            subtitle={t("settings.staffHint")}
          >
            <StaffCard gymId={gym.id} />
          </Section>

          <Section
            icon={MessageSquare}
            color="#10b981"
            bg="rgba(16,185,129,.12)"
            title={t("settings.sectionTemplates")}
            subtitle={t("settings.templatesHint")}
          >
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
      </div>
    </AppShell>
  );
}

function Section({
  icon: Icon,
  color,
  bg,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon;
  color: string;
  bg: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="md-card">
      <div className="md-card-head">
        <div className="md-card-title-row">
          <div className="md-card-ico" style={{ background: bg, color }}>
            <Icon style={{ width: 16, height: 16 }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span className="md-card-title">{title}</span>
            {subtitle && (
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--d-tx3)" }}>
                {subtitle}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="md-card-body">{children}</div>
    </section>
  );
}
