import { describe, it, expect } from "vitest";
import {
  signPassUrlToken,
  verifyPassUrlToken,
  signScanToken,
  parseScanToken,
  verifyScanToken,
  newPassDeviceToken,
  hashPassDevice,
  buildScanUrl,
  buildPassUrl,
} from "@/lib/qr";

const SECRET = "member-qr-secret";
const SCAN_WINDOW_MS = 30 * 1000;

describe("qr — pass URL token (permanent link proof)", () => {
  it("verifies a token signed with the member secret", () => {
    const token = signPassUrlToken("m1", SECRET);
    expect(verifyPassUrlToken("m1", SECRET, token)).toBe(true);
  });

  it("rejects a tampered token, a wrong secret, and a wrong member id", () => {
    const token = signPassUrlToken("m1", SECRET);
    const tampered = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(verifyPassUrlToken("m1", SECRET, tampered)).toBe(false);
    expect(verifyPassUrlToken("m1", "other-secret", token)).toBe(false);
    expect(verifyPassUrlToken("m2", SECRET, token)).toBe(false);
  });

  it("rejects a length-mismatched token without throwing", () => {
    expect(verifyPassUrlToken("m1", SECRET, "short")).toBe(false);
  });
});

describe("qr — rotating scan token", () => {
  // Pin a window boundary so window math is exact: window = floor(ms/1000/30).
  const W = 1000;
  const signMs = W * SCAN_WINDOW_MS; // start of window 1000

  function lookup(id: string) {
    return id === "m1" ? SECRET : null;
  }

  it("encodes <memberId>.<window>.<hmac> and expiry at next window", () => {
    const { token, expiresAt } = signScanToken("m1", SECRET, signMs);
    const parsed = parseScanToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed!.memberId).toBe("m1");
    expect(parsed!.window).toBe(W);
    expect(expiresAt).toBe((W + 1) * SCAN_WINDOW_MS);
  });

  it("accepts the current window and ±1 (the real grace), not a hard 30s", () => {
    const { token } = signScanToken("m1", SECRET, signMs);
    // same window
    expect(verifyScanToken(token, lookup, signMs).ok).toBe(true);
    // +31s → next window (W+1), still within ±1 grace
    expect(verifyScanToken(token, lookup, signMs + 31_000).ok).toBe(true);
    // previous window (W-1)
    expect(verifyScanToken(token, lookup, signMs - 1_000).ok).toBe(true);
  });

  it("expires once the token is ≥2 windows away", () => {
    const { token } = signScanToken("m1", SECRET, signMs);
    const future = verifyScanToken(token, lookup, signMs + 61_000); // W+2
    const past = verifyScanToken(token, lookup, signMs - 31_000); // W-2
    expect(future).toEqual({ ok: false, reason: "expired" });
    expect(past).toEqual({ ok: false, reason: "expired" });
  });

  it("denies a single-character HMAC tamper (cryptographic failure)", () => {
    const { token } = signScanToken("m1", SECRET, signMs);
    const [memberId, windowStr, mac] = token.split(".");
    const flipped = mac.slice(0, -1) + (mac.endsWith("A") ? "B" : "A");
    const tampered = `${memberId}.${windowStr}.${flipped}`;
    expect(verifyScanToken(tampered, lookup, signMs)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("denies an unknown member (no secret on file)", () => {
    const { token } = signScanToken("m1", SECRET, signMs);
    const result = verifyScanToken(token, () => null, signMs);
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("reports a format error for a non-token string", () => {
    expect(parseScanToken("garbage")).toBeNull();
    expect(verifyScanToken("garbage", lookup, signMs)).toEqual({
      ok: false,
      reason: "format",
    });
  });
});

describe("qr — pass device binding hashes", () => {
  it("hashPassDevice is a deterministic 64-char sha256 hex", () => {
    const h1 = hashPassDevice("device-token");
    const h2 = hashPassDevice("device-token");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPassDevice("other")).not.toBe(h1);
  });

  it("newPassDeviceToken returns unique opaque tokens", () => {
    const a = newPassDeviceToken();
    const b = newPassDeviceToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(20);
  });
});

describe("qr — URL builders", () => {
  it("buildScanUrl encodes the token into ?t=", () => {
    expect(buildScanUrl("a.b.c", "https://gym.example")).toBe(
      "https://gym.example/scan-verify?t=a.b.c"
    );
  });

  it("buildPassUrl points at /pass/:memberId/:token", () => {
    expect(buildPassUrl("m1", "tok", "https://gym.example")).toBe(
      "https://gym.example/pass/m1/tok"
    );
  });
});
