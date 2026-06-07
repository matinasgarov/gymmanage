import { describe, it, expect, vi } from "vitest";

// Provide a minimal ModelName enum so tenant.ts's module-load completeness guard
// passes without loading the real Prisma engine.
vi.mock("@/generated/prisma/client", () => ({
  Prisma: {
    ModelName: {
      Member: "Member",
      Payment: "Payment",
      CheckIn: "CheckIn",
      PlanPrice: "PlanPrice",
      AuditLog: "AuditLog",
      Lead: "Lead",
      VisitorPass: "VisitorPass",
      ScannerDevice: "ScannerDevice",
      Gym: "Gym",
      User: "User",
      Freeze: "Freeze",
      PasswordResetToken: "PasswordResetToken",
    },
  },
}));

// A harness that emulates Prisma's `$extends({ query })` contract: it routes
// `client.<model>.<operation>(args)` through the extension's $allOperations hook
// with a terminal `query` that simply echoes the (possibly mutated) args. That
// lets us assert exactly what the tenant extension injects.
vi.mock("@/lib/prisma", () => {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  type Hook = (p: {
    model: string;
    operation: string;
    args: unknown;
    query: (a: unknown) => unknown;
  }) => unknown;
  const prisma = {
    $extends(ext: { query: { $allModels: { $allOperations: Hook } } }) {
      const hook = ext.query.$allModels.$allOperations;
      return new Proxy(
        {},
        {
          get(_t, modelProp) {
            if (typeof modelProp !== "string") return undefined;
            const model = cap(modelProp);
            return new Proxy(
              {},
              {
                get(_t2, opProp) {
                  if (typeof opProp !== "string") return undefined;
                  return (args: unknown) =>
                    hook({ model, operation: opProp, args, query: (a) => a });
                },
              }
            );
          },
        }
      );
    },
  };
  return { prisma };
});

import { forGym } from "@/lib/tenant";

// The harness echoes the (mutated) args back. `forGym` is fully typed against the
// real Prisma client, so view it through a loose echo alias for these injection
// assertions instead of fighting Prisma's input/return types.
type EchoResult = { where?: Record<string, unknown>; data?: Record<string, unknown> };
type EchoModel = Record<string, (args: unknown) => Promise<EchoResult>>;
function db(gymId: string): Record<string, EchoModel> {
  return forGym(gymId) as unknown as Record<string, EchoModel>;
}

describe("tenant — forGym gym scoping", () => {
  it("injects gymId into a findMany where clause", async () => {
    const r = await db("gym1").member.findMany({ where: { status: "ACTIVE" } });
    expect(r.where).toEqual({ status: "ACTIVE", gymId: "gym1" });
  });

  it("injects gymId even when no where is supplied", async () => {
    const r = await db("gym2").payment.count({});
    expect(r.where?.gymId).toBe("gym2");
  });

  it("injects gymId into create data", async () => {
    const r = await db("gym3").member.create({ data: { name: "x" } });
    expect(r.data).toEqual({ name: "x", gymId: "gym3" });
  });

  it("refuses findUnique on a tenant model (must use findFirst)", async () => {
    await expect(db("gym1").member.findUnique({ where: { id: "1" } })).rejects.toThrow(
      /findFirst/
    );
  });

  it("does NOT scope a non-tenant model (e.g. Gym)", async () => {
    const r = await db("gym1").gym.findMany({ where: {} });
    expect(r.where?.gymId).toBeUndefined();
  });
});
