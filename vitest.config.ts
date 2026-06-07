import { defineConfig, configDefaults } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const emptyStub = path.resolve(root, "test/stubs/empty.ts");

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      // `server-only`/`client-only` throw when imported outside an RSC build.
      "server-only": emptyStub,
      "client-only": emptyStub,
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    // Integration tests need a live DB and run via vitest.integration.config.ts.
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
    // Lock the clock's timezone. Attendance buckets into Asia/Baku (UTC+4) and
    // expiry math uses UTC day boundaries; pinning TZ keeps both deterministic.
    env: {
      TZ: "Asia/Baku",
      QR_SIGNING_SECRET: "test-qr-signing-secret",
      NEXTAUTH_SECRET: "test-session-secret",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    },
  },
});
