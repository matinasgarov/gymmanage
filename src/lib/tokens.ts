import "server-only";
import crypto from "node:crypto";

// Raw token sent in the emailed URL. 32 bytes → 43-char URL-safe string.
export function generateToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

// Only the hash is stored — mirrors ScannerDevice.tokenHash (src/lib/device.ts).
export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function makeExpiry(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export const INVITE_TTL_HOURS = 48;
export const RESET_TTL_HOURS = 1;
