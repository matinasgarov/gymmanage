// Runs once at server startup (Next.js instrumentation hook).
export async function register() {
  // Only the Node.js runtime needs the full env validation; the edge runtime
  // (proxy) only reads NEXTAUTH_SECRET which is checked there on use.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
  }
}
