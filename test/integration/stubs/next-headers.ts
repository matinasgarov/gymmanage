// Test double for `next/headers`. Backs cookies()/headers() with module-level
// in-memory jars the tests can inspect/clear. `createSession` writes the real
// signed JWT into this jar, so the auth path runs for real.

const cookieJar = new Map<string, string>();
const headerJar = new Map<string, string>();

export async function cookies() {
  return {
    get(name: string) {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name: string, value: string, _opts?: unknown) {
      cookieJar.set(name, value);
    },
    delete(name: string) {
      cookieJar.delete(name);
    },
  };
}

export async function headers() {
  return {
    get(name: string) {
      return headerJar.get(name.toLowerCase()) ?? null;
    },
  };
}

// ── test controls ──────────────────────────────────────────────────────
export function __clearCookies() {
  cookieJar.clear();
}
export function __clearHeaders() {
  headerJar.clear();
}
export function __setHeader(name: string, value: string) {
  headerJar.set(name.toLowerCase(), value);
}
