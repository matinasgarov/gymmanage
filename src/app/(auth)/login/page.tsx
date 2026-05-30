import Link from "next/link";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-1">Daxil olun</h1>
        <p className="text-sm text-neutral-600 mb-6">
          Zalınızı idarə etmək üçün hesabınıza daxil olun.
        </p>
        <LoginForm />
        <p className="text-sm text-neutral-600 mt-4 text-center">
          Yeni zal?{" "}
          <Link href="/signup" className="text-blue-600 hover:underline">
            Qeydiyyatdan keçin
          </Link>
        </p>
      </div>
    </main>
  );
}
