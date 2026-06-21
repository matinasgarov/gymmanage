import { describe, it, expect } from "vitest";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";

describe("rate-limit — rateLimit", () => {
  it("allows up to `max` attempts then blocks", async () => {
    const key = "test:allow-then-block";
    const max = 3;
    const windowMs = 60_000;

    const r1 = await rateLimit(key, max, windowMs);
    const r2 = await rateLimit(key, max, windowMs);
    const r3 = await rateLimit(key, max, windowMs);
    const r4 = await rateLimit(key, max, windowMs);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r4.allowed).toBe(false);
    expect(r4.retryAfterSec).toBeGreaterThan(0);
  });

  it("starts a fresh window once the previous one has elapsed", async () => {
    const key = "test:window-rollover";
    // windowMs = 0 means every call is treated as a new window.
    const r1 = await rateLimit(key, 1, 0);
    const r2 = await rateLimit(key, 1, 0);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });

  it("isolates separate keys", async () => {
    const a = await rateLimit("test:key-a", 1, 60_000);
    await rateLimit("test:key-a", 1, 60_000); // exhaust key-a
    const b = await rateLimit("test:key-b", 1, 60_000);

    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });

  it("resetRateLimit clears the counter", async () => {
    const key = "test:reset";
    await rateLimit(key, 1, 60_000);
    const blocked = await rateLimit(key, 1, 60_000);
    expect(blocked.allowed).toBe(false);

    await resetRateLimit(key);
    const afterReset = await rateLimit(key, 1, 60_000);
    expect(afterReset.allowed).toBe(true);
  });
});
