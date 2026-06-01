import Link from "next/link";
import { ResetForm } from "./reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-1">Yeni şifrə təyin edin</h1>
        {token ? (
          <>
            <p className="text-sm text-neutral-600 mb-6">
              Hesabınız üçün yeni bir şifrə seçin.
            </p>
            <ResetForm token={token} />
          </>
        ) : (
          <p className="text-sm text-red-600 mb-6">
            Link etibarsızdır.{" "}
            <Link href="/forgot-password" className="text-blue-600 hover:underline">
              Yenidən cəhd edin
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
