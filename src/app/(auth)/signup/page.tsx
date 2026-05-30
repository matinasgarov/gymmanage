import Link from "next/link";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-1">GymPass-a qoşulun</h1>
        <p className="text-sm text-neutral-600 mb-6">
          Zalınızı qeydiyyatdan keçirin və idarəetməyə başlayın.
        </p>
        <SignupForm />
        <p className="text-sm text-neutral-600 mt-4 text-center">
          Hesabınız var?{" "}
          <Link href="/login" className="text-blue-600 hover:underline">
            Daxil olun
          </Link>
        </p>
      </div>
    </main>
  );
}
