import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-1">Şifrəni unutmusunuz?</h1>
        <p className="text-sm text-neutral-600 mb-6">
          Email ünvanınızı daxil edin — sizə sıfırlama linki göndərəcəyik.
        </p>
        <ForgotForm />
        <p className="text-sm text-neutral-600 mt-4 text-center">
          <Link href="/login" className="text-blue-600 hover:underline">
            Girişə qayıt
          </Link>
        </p>
      </div>
    </main>
  );
}
