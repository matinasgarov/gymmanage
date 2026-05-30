import "server-only";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { forGym } from "@/lib/tenant";

export const DEVICE_COOKIE = "gympass_scanner_device";
const ONE_YEAR_S = 365 * 24 * 60 * 60;
// Throttle lastSeenAt writes — at most once per minute per device.
const LAST_SEEN_THROTTLE_MS = 60 * 1000;

export type DevicePayload = {
  id: string;
  gymId: string;
  name: string;
};

export function hashDeviceToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function setDeviceCookie(token: string) {
  const store = await cookies();
  store.set(DEVICE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ONE_YEAR_S,
    path: "/",
  });
}

export async function clearDeviceCookie() {
  const store = await cookies();
  store.delete(DEVICE_COOKIE);
}

// Returns the paired device for this request, or null if absent/invalid/revoked.
export async function readDevice(): Promise<DevicePayload | null> {
  const store = await cookies();
  const raw = store.get(DEVICE_COOKIE)?.value;
  if (!raw) return null;

  const tokenHash = hashDeviceToken(raw);
  const device = await prisma.scannerDevice.findUnique({
    where: { tokenHash },
    select: { id: true, gymId: true, name: true, revokedAt: true, lastSeenAt: true },
  });
  if (!device || device.revokedAt) return null;

  // Best-effort, throttled lastSeenAt bump. Don't block on this.
  const now = Date.now();
  const last = device.lastSeenAt?.getTime() ?? 0;
  if (now - last > LAST_SEEN_THROTTLE_MS) {
    prisma.scannerDevice
      .update({ where: { id: device.id }, data: { lastSeenAt: new Date(now) } })
      .catch(() => {
        // intentionally swallow — telemetry, not load-bearing
      });
  }

  return { id: device.id, gymId: device.gymId, name: device.name };
}

// Returns { device, db: forGym(device.gymId) }. Redirects to /door/pair when
// no device cookie is present, /door/revoked when revoked/invalid.
// Use this from /door pages and from any device-only server action.
export async function getDeviceDb() {
  const device = await readDevice();
  if (!device) {
    // We can't tell here whether the cookie was absent or revoked without
    // re-reading; readDevice returns null for both. Send unauthenticated
    // devices to /door/pair — revoked devices end up there too, which is fine
    // (they re-pair). For an explicit revoked message, callers can branch.
    const { redirect } = await import("next/navigation");
    return redirect("/door/pair");
  }
  return { device, db: forGym(device.gymId) };
}
