import { Prisma } from '../generated/prisma/client';

/**
 * Wraps every query in a transaction that first sets a Postgres session variable via
 * `set_config(..., true)` — the trailing `true` makes it transaction-local (`SET LOCAL`
 * semantics), so it can never leak onto a pooled connection and apply to a later, unrelated
 * request.
 */
function withSessionVar(key: string, value: string) {
  return Prisma.defineExtension((prisma) =>
    prisma.$extends({
      name: `session-var:${key}`,
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            const [, result] = await prisma.$transaction([
              prisma.$executeRaw`SELECT set_config(${key}, ${value}, true)`,
              query(args),
            ]);
            return result;
          },
        },
      },
    }),
  );
}

/**
 * The `membership` table's row-level security policy checks `app.current_tenant_id`. Querying
 * with the plain (non-extended) client instead of this one means the policy sees no
 * current_tenant_id set and returns zero rows — not another tenant's rows. Fails closed by
 * construction. Use this once the active tenant is known (i.e. everywhere except the tenant
 * resolution lookup itself — see `forUser`).
 */
export function forTenant(tenantId: string) {
  return withSessionVar('app.current_tenant_id', tenantId);
}

/**
 * Resolving *which* tenant a request belongs to means reading `membership` rows before a tenant
 * id is known — `forTenant` can't help yet, that's the chicken-and-egg problem. The membership
 * RLS policy has a second branch allowing a row to be read when `user_id` matches
 * `app.current_user_id`, specifically so `TenantContext` can look up "my own memberships" this
 * way. Only ever used for that one self-lookup, never as a substitute for `forTenant` elsewhere.
 */
export function forUser(userId: string) {
  return withSessionVar('app.current_user_id', userId);
}
