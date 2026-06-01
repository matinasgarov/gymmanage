import Link from "next/link";
import { AcceptForm } from "./accept-form";

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-1">Xoş gəlmisiniz!</h1>
        {token ? (
          <>
            <p className="text-sm text-neutral-600 mb-6">
              Hesabınızı aktivləşdirmək üçün bir şifrə təyin edin.
            </p>
            <AcceptForm token={token} />
          </>
        ) : (
          <p className="text-sm text-red-600 mb-6">
            Dəvət linki etibarsızdır.{" "}
            <Link href="/login" className="text-blue-600 hover:underline">
              Girişə qayıt
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
