import { ShieldOff } from "lucide-react";
import Link from "next/link";
import { getT } from "@/lib/i18n-server";

export default async function DoorRevokedPage() {
  const t = await getT();
  return (
    <main className="min-h-screen bg-[var(--background)] flex items-center justify-center px-4 py-10">
      <div className="card w-full max-w-sm p-6 space-y-4 text-center">
        <ShieldOff className="w-8 h-8 text-red-500 mx-auto" />
        <h1 className="font-medium">{t("door.revokedTitle")}</h1>
        <p className="text-sm text-[var(--muted)]">{t("door.revokedText")}</p>
        <Link href="/door/pair" className="btn-ghost inline-block">
          {t("door.revokedAction")}
        </Link>
      </div>
    </main>
  );
}
