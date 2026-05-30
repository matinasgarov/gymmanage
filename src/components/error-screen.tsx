"use client";

export function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-6">
      <div className="w-full max-w-md bg-white border rounded-lg p-6 text-center">
        <h1 className="text-lg font-semibold mb-2">Bir şey səhv getdi</h1>
        <p className="text-sm text-neutral-600 mb-4">
          Səhifə açılmadı. Yenidən cəhd edin.
        </p>
        {error.digest && (
          <p className="text-xs text-neutral-400 mb-4">Kod: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="px-4 py-2 bg-black text-white rounded-md text-sm"
        >
          Yenidən cəhd et
        </button>
      </div>
    </div>
  );
}
