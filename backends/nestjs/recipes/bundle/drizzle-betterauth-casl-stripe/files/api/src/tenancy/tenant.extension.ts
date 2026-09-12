import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

/**
 * Generic over the schema a given `db` was constructed with, rather than hardcoded to
 * `../db/schema` — `auth.ts` builds its own `db` from a schema that also includes the
 * auth-generated tables (see auth.ts), and this needs to accept either.
 */
type AnyDb = NodePgDatabase<Record<string, unknown>>;

/**
 * Runs `fn` inside a transaction that first sets a Postgres session variable via `set_config(...,
 * true)` — the trailing `true` makes it transaction-local (`SET LOCAL` semantics), so it can never
 * leak onto a pooled connection and apply to a later, unrelated request. Prisma's equivalent
 * (`tenant.extension.ts` in the Prisma bundle) hooks this into every query automatically via
 * `$extends`; Drizzle has no per-query middleware hook, so callers explicitly wrap the queries that
 * need tenant scoping in this transaction callback instead — same guarantee, more visible call site.
 */
function withSessionVar<Db extends AnyDb, T>(
  db: Db,
  key: string,
  value: string,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config(${key}, ${value}, true)`);
    // `tx`'s inferred type (`PgTransaction<...>`) and `Db` are both concrete instantiations of
    // Drizzle's generic node-postgres db type, but not nominally related enough for a direct
    // assertion — hence the `unknown` hop. Structurally they expose the identical query builder
    // surface (`.select()`/`.insert()`/etc.), which is all `fn` ever calls.
    return fn(tx as unknown as Db);
  });
}

/**
 * The `membership`/`subscription`/`project` tables' row-level security policies check
 * `app.current_tenant_id`. Querying with the plain (non-wrapped) db instead of this means the
 * policy sees no current_tenant_id set and returns zero rows — not another tenant's rows. Fails
 * closed by construction. Use this once the active tenant is known (i.e. everywhere except the
 * tenant resolution lookup itself — see `withUser`).
 */
export function withTenant<Db extends AnyDb, T>(
  db: Db,
  tenantId: string,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  return withSessionVar(db, 'app.current_tenant_id', tenantId, fn);
}

/**
 * Resolving *which* tenant a request belongs to means reading `membership` rows before a tenant id
 * is known — `withTenant` can't help yet, that's the chicken-and-egg problem. The membership RLS
 * policy has a second branch allowing a row to be read when `user_id` matches
 * `app.current_user_id`, specifically so `TenantContext` can look up "my own memberships" this way.
 * Only ever used for that one self-lookup, never as a substitute for `withTenant` elsewhere.
 */
export function withUser<Db extends AnyDb, T>(
  db: Db,
  userId: string,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  return withSessionVar(db, 'app.current_user_id', userId, fn);
}
