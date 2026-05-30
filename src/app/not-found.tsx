import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-md bg-white border rounded-lg p-6 text-center">
        <div className="text-4xl mb-2">404</div>
        <h1 className="text-lg font-semibold mb-2">Səhifə tapılmadı</h1>
        <p className="text-sm text-neutral-600 mb-4">
          Axtardığınız səhifə mövcud deyil.
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-4 py-2 bg-black text-white rounded-md text-sm"
        >
          Panelə qayıt
        </Link>
      </div>
    </div>
  );
}
