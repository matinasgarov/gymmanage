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
      <div
        className="shrink-0 flex items-center justify-center overflow-hidden"
        style={{
          width: 72,
          height: 72,
          borderRadius: 16,
          background: "rgba(59,123,246,.12)",
          color: "#3b7bf6",
          fontSize: 26,
          fontWeight: 800,
        }}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={gymName} className="w-full h-full object-cover" />
        ) : (
          gymName.slice(0, 1).toUpperCase()
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={pending}
            className="md-edit-btn"
            style={{ opacity: pending ? 0.5 : 1 }}
          >
            <Camera className="w-3.5 h-3.5" />
            {preview ? t("settings.logoChange") : t("settings.logoAdd")}
          </button>
          {preview && (
            <button
              type="button"
              onClick={onRemove}
              disabled={pending}
              className="md-btn-delete"
              style={{ width: "auto", padding: "0 14px", opacity: pending ? 0.5 : 1 }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t("common.delete")}
            </button>
          )}
        </div>
        {error && <p style={{ fontSize: 12, fontWeight: 600, color: "#ef4444" }}>{error}</p>}
        <p style={{ fontSize: 11, fontWeight: 500, color: "var(--d-tx3)" }}>{t("settings.logoHint")}</p>
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
