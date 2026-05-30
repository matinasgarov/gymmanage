import "server-only";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

// Single seam between the app and wherever uploaded files live.
//
// Today: local filesystem under public/ — works in dev and on a single
// self-hosted node, but NOT on serverless (Vercel etc., read-only FS).
//
// To move to S3 / Supabase Storage / Vercel Blob, reimplement `put` and
// `remove` here and change nothing else in the app. Callers only ever see
// the public URL string.

export type StorageObject = {
  /** Logical folder, e.g. "members" or "gyms" */
  prefix: string;
  /** Stable id used to namespace the file, e.g. memberId */
  ownerId: string;
  bytes: Buffer;
  contentType: string;
};

const PUBLIC_ROOT = path.join(process.cwd(), "public");

function extFor(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

// Returns the public URL of the stored object.
export async function put(obj: StorageObject): Promise<string> {
  const relDir = path.posix.join("uploads", obj.prefix);
  const absDir = path.join(PUBLIC_ROOT, "uploads", obj.prefix);
  await mkdir(absDir, { recursive: true });

  // Content hash in the name busts browser caches when the file changes.
  const hash = crypto.createHash("sha1").update(obj.bytes).digest("hex").slice(0, 8);
  const filename = `${obj.ownerId}-${hash}.${extFor(obj.contentType)}`;
  await writeFile(path.join(absDir, filename), obj.bytes);
  return `/${relDir}/${filename}`;
}

// Best-effort delete; safe to call with a foreign/non-managed URL (no-op).
export async function remove(publicUrl: string | null | undefined): Promise<void> {
  if (!publicUrl || !publicUrl.startsWith("/uploads/")) return;
  const abs = path.join(PUBLIC_ROOT, publicUrl.replace(/^\//, ""));
  try {
    await unlink(abs);
  } catch {
    // file may not exist — ignore
  }
}

export function isManagedUrl(url: string | null | undefined): boolean {
  return !!url && url.startsWith("/uploads/");
}
