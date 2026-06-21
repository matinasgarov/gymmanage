import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export type RateLimitResult = {
  allowed: boolean;
  // Seconds until the current window resets (only meaningful when blocked).
  retryAfterSec: number;
};

// Fixed-window counter backed by the RateLimit table. One row per `key`; the
// window rolls over (count → 1) once `windowMs` has elapsed since `windowStart`.
// Not perfectly atomic under heavy concurrency, but more than adequate for the
// scale of a single-gym deployment and far better than no limiter at all.
export async function rateLimit(
  key: string,
  max: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const existing = await prisma.rateLimit.findUnique({ where: { key } });

  // No row yet, or the previous window has fully elapsed → start a fresh window.
  if (!existing || now - existing.windowStart.getTime() >= windowMs) {
    await prisma.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, windowStart: new Date(now) },
      update: { count: 1, windowStart: new Date(now) },
    });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (existing.count >= max) {
    const retryAfterSec = Math.ceil(
      (windowMs - (now - existing.windowStart.getTime())) / 1000
    );
    return { allowed: false, retryAfterSec: Math.max(1, retryAfterSec) };
  }

  await prisma.rateLimit.update({
    where: { key },
    data: { count: { increment: 1 } },
  });
  return { allowed: true, retryAfterSec: 0 };
}

// Clear a limiter (e.g. after a successful login) so a legitimate user isn't
// penalised by their earlier failed attempts.
export async function resetRateLimit(key: string): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { key } });
}

// Best-effort client IP from proxy headers. Falls back to "unknown" so the
// limiter still functions (all unknown-IP traffic shares one bucket) rather
// than throwing when no proxy header is present.
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip") ?? "unknown";
}
