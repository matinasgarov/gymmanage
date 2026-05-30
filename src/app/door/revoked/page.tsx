import { ShieldOff } from "lucide-react";
import Link from "next/link";

export default function DoorRevokedPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] flex items-center justify-center px-4 py-10">
      <div className="card w-full max-w-sm p-6 space-y-4 text-center">
        <ShieldOff className="w-8 h-8 text-red-500 mx-auto" />
        <h1 className="font-medium">Bu cihaz ləğv edilib</h1>
        <p className="text-sm text-[var(--muted)]">
          Skaner cihazınız sahibiniz tərəfindən söndürülüb. Yenidən qoşulmaq üçün
          ondan yeni qoşulma kodu istəyin.
        </p>
        <Link href="/door/pair" className="btn-ghost inline-block">
          Yenidən qoşul
        </Link>
      </div>
    </main>
  );
}
