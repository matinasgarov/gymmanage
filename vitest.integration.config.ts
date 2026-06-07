import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const emptyStub = path.resolve(root, "test/stubs/empty.ts");
const stub = (f: string) => path.resolve(root, "test/integration/stubs", f);

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "server-only": emptyStub,
      "client-only": emptyStub,
      // Replace Next request-scoped APIs with controllable test doubles.
      "next/headers": stub("next-headers.ts"),
      "next/navigation": stub("next-navigation.ts"),
      "next/cache": stub("next-cache.ts"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.integration.test.ts"],
    setupFiles: ["test/integration/setup.ts"],
    // One shared test DB — run files serially and disable concurrency.
    fileParallelism: false,
    sequence: { concurrent: false },
    hookTimeout: 30_000,
    testTimeout: 30_000,
    env: {
      TZ: "Asia/Baku",
      DATABASE_URL: "postgresql://gympass:gympass_dev@localhost:5432/gympass_test?schema=public",
      NEXTAUTH_SECRET: "test-session-secret",
      QR_SIGNING_SECRET: "test-qr-signing-secret",
    },
  },
});
