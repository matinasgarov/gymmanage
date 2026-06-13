"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, X } from "lucide-react";
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
    <div className="md-avatar-wrap">
      <div className="md-avatar">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={memberName} />
        ) : (
          memberName.slice(0, 1).toUpperCase()
        )}
      </div>
      <button
        type="button"
        onClick={onPick}
        disabled={pending}
        className="md-avatar-cam"
        title={previewUrl ? "Şəkli dəyiş" : "Şəkil əlavə et"}
      >
        <Camera style={{ width: 11, height: 11 }} strokeWidth={2.5} />
      </button>
      {previewUrl && (
        <button
          type="button"
          onClick={onRemove}
          disabled={pending}
          className="md-avatar-del"
          title="Şəkli sil"
        >
          <X style={{ width: 11, height: 11 }} strokeWidth={2.8} />
        </button>
      )}
      {error && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            whiteSpace: "nowrap",
            fontSize: 11,
            fontWeight: 600,
            color: "#ef4444",
            background: "#fff",
            padding: "2px 6px",
            borderRadius: 6,
            boxShadow: "var(--d-sh1)",
            zIndex: 5,
          }}
        >
          {error}
        </div>
      )}
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
