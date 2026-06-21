import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Models that carry a `gymId` and must never be queried across tenants.
const TENANT_MODELS = new Set<string>([
  "Member",
  "Payment",
  "CheckIn",
  "PlanPrice",
  "AuditLog",
  "Lead",
  "VisitorPass",
  "ScannerDevice",
]);

// Models that intentionally are NOT gym-scoped by this extension:
//  - Gym:    the tenant root itself
//  - User:   the auth anchor; looked up by id/email via the raw client
//  - Freeze: scoped transitively through its `member` (it has no `gymId` column,
//            so injecting one would be an "Unknown argument" error)
//  - PasswordResetToken: scoped transitively through its `user` (no `gymId`
//            column); only ever read/written via the raw client in auth flows.
//  - TwoFactorCode: scoped transitively through its `user`; auth-flow only.
//  - RateLimit: global (keyed by action+identity, e.g. IP/email); not a tenant.
const NON_TENANT_MODELS = new Set<string>([
  "Gym",
  "User",
  "Freeze",
  "PasswordResetToken",
  "TwoFactorCode",
  "RateLimit",
  "PendingSignup",
]);

// Completeness guard (fail-closed): every model in the schema must be consciously
// classified. If a model is added later and left unclassified, this throws at
// module load instead of silently leaving the new model unscoped.
for (const model of Object.values(Prisma.ModelName)) {
  const classified = TENANT_MODELS.has(model) !== NON_TENANT_MODELS.has(model);
  if (!classified) {
    throw new Error(
      `tenant.ts: model "${model}" is not classified. Add it to TENANT_MODELS ` +
        `(if it has a gymId) or NON_TENANT_MODELS (if it does not).`
    );
  }
}

type AnyArgs = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  create?: Record<string, unknown>;
};

function injectWhere(args: AnyArgs, gymId: string) {
  args.where = { ...(args.where ?? {}), gymId };
}

/**
 * A Prisma client scoped to a single gym. Every read/write on a tenant model
 * is automatically constrained to `gymId`, so it is impossible to read or
 * mutate another gym's rows — even if a caller forgets the filter.
 *
 * Use this for ALL authenticated, gym-scoped data access. The raw `prisma`
 * client is reserved for: signup (no gym yet), public token pages
 * (/pass, /visit, /join), and internal helpers that receive an explicit gymId.
 *
 * NOTE: `findUnique`/`findUniqueOrThrow` are not supported on tenant models
 * here (Prisma only allows unique fields in their `where`). Use `findFirst`.
 */
export function forGym(gymId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) {
            return query(args);
          }

          const a = (args ?? {}) as AnyArgs;

          switch (operation) {
            case "findUnique":
            case "findUniqueOrThrow":
              throw new Error(
                `forGym: use findFirst instead of ${operation} on ${model} (gym scoping needs a non-unique where).`
              );

            case "findFirst":
            case "findFirstOrThrow":
            case "findMany":
            case "count":
            case "aggregate":
            case "groupBy":
            case "updateMany":
            case "updateManyAndReturn":
            case "deleteMany":
            case "update":
            case "delete":
              injectWhere(a, gymId);
              return query(a);

            case "create":
              a.data = { ...(a.data as Record<string, unknown>), gymId };
              return query(a);

            case "createMany":
            case "createManyAndReturn": {
              const rows = a.data as Record<string, unknown>[];
              a.data = (Array.isArray(rows) ? rows : [rows]).map((r) => ({
                ...r,
                gymId,
              }));
              return query(a);
            }

            case "upsert":
              injectWhere(a, gymId);
              a.create = { ...(a.create ?? {}), gymId };
              return query(a);

            default:
              // Fail closed: an unrecognized operation on a tenant model must
              // never run unscoped. If Prisma adds a new operation, it has to
              // be handled here explicitly before it can touch tenant data.
              throw new Error(
                `forGym: operation "${operation}" on ${model} is not gym-scoped; refusing to run it unscoped.`
              );
          }
        },
      },
    },
  });
}

export type GymDb = ReturnType<typeof forGym>;
