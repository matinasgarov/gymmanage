"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Trash2 } from "lucide-react";
import { uploadGymLogo, removeGymLogo } from "@/lib/settings-actions";
import { useT } from "@/components/i18n-provider";

const MAX_SIDE = 400;

async function resizeToWebp(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/webp", 0.85)
  );
  if (!blob) return file;
  return new File([blob], "logo.webp", { type: "image/webp" });
}

export function LogoForm({
  currentUrl,
  gymName,
}: {
  currentUrl: string | null;
  gymName: string;
}) {
  const t = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resized = await resizeToWebp(file);
      const fd = new FormData();
      fd.append("logo", resized);
      startTransition(async () => {
        const res = await uploadGymLogo(undefined, fd);
        if (res?.ok) {
          setPreview(URL.createObjectURL(resized));
        } else if (res?.message) {
          setError(res.message);
        }
      });
    } catch {
      setError(t("settings.logoError"));
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const onRemove = () => {
    startTransition(async () => {
      await removeGymLogo();
      setPreview(null);
    });
  };

  return (
    <div className="flex items-center gap-4">
      <div className="w-20 h-20 rounded-xl overflow-hidden bg-[var(--brand-soft)] text-[var(--brand-strong)] flex items-center justify-center text-2xl font-semibold shrink-0">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={gymName} className="w-full h-full object-cover" />
        ) : (
          gymName.slice(0, 1).toUpperCase()
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={pending}
            className="btn-ghost inline-flex items-center gap-1.5"
          >
            <Camera className="w-3.5 h-3.5" />
            {preview ? t("settings.logoChange") : t("settings.logoAdd")}
          </button>
          {preview && (
            <button
              type="button"
              onClick={onRemove}
              disabled={pending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-700 rounded-full text-sm hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t("common.delete")}
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <p className="text-[11px] text-[var(--muted)]">{t("settings.logoHint")}</p>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFile}
      />
    </div>
  );
}
