import { PrismaClient, Prisma } from "@/generated/prisma/client";

// The transaction callback receives a scoped client. Use this instead of the
// `Parameters<Parameters<typeof prisma.$transaction>[0]>[0]` noise.
export type Tx = Prisma.TransactionClient;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
