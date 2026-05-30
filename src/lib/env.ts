import "server-only";

// Markers that indicate a secret is still a placeholder from .env.example.
const PLACEHOLDER_MARKERS = [
  "dev-only",
  "replace-in-prod",
  "changeme",
  "your_secret",
  "xxxx",
];

function assertSecret(name: string, value: string | undefined) {
  if (!value || value.length < 16) {
    throw new Error(
      `[env] ${name} is missing or too short (min 16 chars). Generate one with: openssl rand -base64 32`
    );
  }
  if (process.env.NODE_ENV === "production") {
    const lower = value.toLowerCase();
    if (PLACEHOLDER_MARKERS.some((m) => lower.includes(m))) {
      throw new Error(
        `[env] ${name} is still a placeholder value — set a real secret before deploying to production.`
      );
    }
  }
}

// Throws on misconfiguration. Called once at server startup via instrumentation.
export function validateEnv() {
  if (!process.env.DATABASE_URL) {
    throw new Error("[env] DATABASE_URL is missing");
  }
  assertSecret("NEXTAUTH_SECRET", process.env.NEXTAUTH_SECRET);
  assertSecret("QR_SIGNING_SECRET", process.env.QR_SIGNING_SECRET);
}
