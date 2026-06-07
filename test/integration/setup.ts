import { beforeEach, afterAll } from "vitest";
import { resetDb, prisma } from "./helpers";
import { __clearCookies, __clearHeaders } from "./stubs/next-headers";

// Isolation: clear auth state and truncate the test DB before every test.
beforeEach(async () => {
  __clearCookies();
  __clearHeaders();
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});
