import "server-only";
import crypto from "node:crypto";

// Window length for rotating scan tokens. Scanner accepts current ±1 window.
const SCAN_WINDOW_SECONDS = 30;

function qrSecret(): string {
  const s = process.env.QR_SIGNING_SECRET;
  if (!s) throw new Error("QR_SIGNING_SECRET is not set");
  return s;
}

function hmac(input: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(input).digest("base64url");
}

// Permanent URL token: proves the holder of the link knows the member's qrSecret.
// Embedded in the member pass URL (/pass/:memberId/:token). Not a scan token.
export function signPassUrlToken(memberId: string, memberQrSecret: string): string {
  return hmac(`pass:${memberId}`, memberQrSecret);
}

export function verifyPassUrlToken(
  memberId: string,
  memberQrSecret: string,
  token: string
): boolean {
  const expected = signPassUrlToken(memberId, memberQrSecret);
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

// Rotating scan token. Includes memberId + current window + HMAC.
// Format: <memberId>.<window>.<hmac>
export function signScanToken(memberId: string, memberQrSecret: string, nowMs = Date.now()): {
  token: string;
  expiresAt: number;
} {
  const window = Math.floor(nowMs / 1000 / SCAN_WINDOW_SECONDS);
  const mac = hmac(`scan:${memberId}:${window}`, qrSecret() + memberQrSecret);
  const expiresAt = (window + 1) * SCAN_WINDOW_SECONDS * 1000;
  return { token: `${memberId}.${window}.${mac}`, expiresAt };
}

export type ScanTokenVerification =
  | { ok: true; memberId: string }
  | { ok: false; reason: "format" | "expired" | "invalid" };

export function parseScanToken(token: string): { memberId: string; window: number; mac: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [memberId, windowStr, mac] = parts;
  const window = parseInt(windowStr, 10);
  if (!Number.isFinite(window)) return null;
  return { memberId, window, mac };
}

export function verifyScanToken(
  token: string,
  lookupQrSecret: (memberId: string) => string | null,
  nowMs = Date.now()
): ScanTokenVerification {
  const parsed = parseScanToken(token);
  if (!parsed) return { ok: false, reason: "format" };

  const currentWindow = Math.floor(nowMs / 1000 / SCAN_WINDOW_SECONDS);
  if (Math.abs(parsed.window - currentWindow) > 1) {
    return { ok: false, reason: "expired" };
  }

  const memberQrSecret = lookupQrSecret(parsed.memberId);
  if (!memberQrSecret) return { ok: false, reason: "invalid" };

  const expected = hmac(
    `scan:${parsed.memberId}:${parsed.window}`,
    qrSecret() + memberQrSecret
  );
  if (expected.length !== parsed.mac.length) return { ok: false, reason: "invalid" };
  const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parsed.mac));
  return ok ? { ok: true, memberId: parsed.memberId } : { ok: false, reason: "invalid" };
}

export function buildScanUrl(token: string, origin: string): string {
  return `${origin}/scan-verify?t=${encodeURIComponent(token)}`;
}

export function buildPassUrl(memberId: string, urlToken: string, origin: string): string {
  return `${origin}/pass/${memberId}/${urlToken}`;
}
