"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Trash2 } from "lucide-react";
import {
  uploadMemberPhoto,
  removeMemberPhoto,
  type PhotoResult,
} from "@/lib/photo-actions";

const MAX_SIDE = 480;

async function resizeToWebp(file: File): Promise<File> {
  // Browsers without createImageBitmap support are extremely rare in 2026
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
  return new File([blob], "photo.webp", { type: "image/webp" });
}

export function PhotoUpload({
  memberId,
  currentUrl,
  memberName,
}: {
  memberId: string;
  currentUrl: string | null;
  memberName: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onPick = () => fileInput.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const resized = await resizeToWebp(file);
      const fd = new FormData();
      fd.append("photo", resized);
      startTransition(async () => {
        const res: PhotoResult = await uploadMemberPhoto(memberId, undefined, fd);
        if (!res.ok) setError(res.message);
        else setPreviewUrl(res.url);
      });
    } catch {
      setError("Şəkli emal edə bilmədik. Başqa şəkil sınayın.");
    } finally {
      // Allow picking the same file again later
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const onRemove = () => {
    startTransition(async () => {
      const res = await removeMemberPhoto(memberId);
      if (res.ok) setPreviewUrl(null);
    });
  };

  return (
    <div className="flex items-center gap-4">
      <div className="w-20 h-20 rounded-full overflow-hidden bg-[var(--brand-soft)] text-[var(--brand-strong)] flex items-center justify-center text-2xl font-semibold shrink-0">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={memberName}
            className="w-full h-full object-cover"
          />
        ) : (
          memberName.slice(0, 1).toUpperCase()
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onPick}
            disabled={pending}
            className="btn-ghost inline-flex items-center gap-1.5"
          >
            <Camera className="w-3.5 h-3.5" />
            {previewUrl ? "Şəkli dəyiş" : "Şəkil əlavə et"}
          </button>
          {previewUrl && (
            <button
              type="button"
              onClick={onRemove}
              disabled={pending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-700 rounded-full text-sm hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Sil
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <p className="text-[11px] text-[var(--muted)]">
          Skan zamanı işçi üzü uyğunlaşdırması üçün istifadə olunur.
        </p>
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
