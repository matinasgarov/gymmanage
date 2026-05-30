import { getCurrentUser } from "@/lib/dal";
import { Sidebar } from "@/components/sidebar";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <div className="min-h-screen bg-[var(--background)] flex">
      <Sidebar
        gymName={user.gym.name}
        gymLogoUrl={user.gym.logoUrl}
        userName={user.name}
        role={user.role}
      />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
