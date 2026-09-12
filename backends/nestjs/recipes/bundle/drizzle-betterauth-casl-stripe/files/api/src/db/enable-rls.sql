-- Not run through drizzle-kit's own migration journal — postInstall.ts applies this directly (as
-- the DATABASE_URL superuser, after drizzle-kit's own schema migration) via a plain client, once
-- drizzle-kit's schema migration has created the tables this refers to. Unlike the Prisma bundle
-- (whose migration folders are just timestamped directories Prisma discovers on disk), drizzle-kit
-- tracks applied migrations in a `meta/_journal.json` file with an undocumented, version-sensitive
-- format — hand-authoring a new entry there to fold this in as a "real" tracked migration was judged
-- more fragile than applying it directly. It's still idempotent (IF NOT EXISTS / OR REPLACE-style
-- guards throughout) so re-running postInstall's steps against an already-migrated database is safe.

-- Runtime app role: the app connects as this (via APP_DATABASE_URL), never as the DATABASE_URL
-- superuser used for migrations. Postgres superusers unconditionally bypass row-level security —
-- FORCE ROW LEVEL SECURITY does not override that — so without a separate, non-superuser role the
-- policy below would silently do nothing.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_role') THEN
    -- Fine for local dev, same story as BETTER_AUTH_SECRET's placeholder — rotate this for any
    -- real deployment.
    CREATE ROLE app_role LOGIN PASSWORD 'changeme-app-role-password';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_role;

-- Every policy below casts "tenantId"::text rather than casting current_setting(...) to uuid —
-- tenantId columns are uuid (see schema.ts), but current_setting() always returns text, so a naive
-- comparison needs *a* cast somewhere. Casting the setting to uuid was tried first and is wrong:
-- on a pooled connection, once a `SET LOCAL app.current_tenant_id = ...` has committed once, the
-- GUC's value outside a transaction reverts to '' (empty string), not NULL — a real, verified-live
-- Postgres behavior for custom GUCs that have never had a non-transactional value — and
-- `''::uuid` raises "invalid input syntax for type uuid", a hard 500 on the very next request that
-- reuses that connection without itself setting the tenant (e.g. withUser()'s own query, whose
-- policy branch never sets current_tenant_id at all). Casting the column to text instead means an
-- unset/''-valued setting just fails the equality check normally — filtered out, not an error.

-- Real referential integrity for membership."userId" -> user.id. Not expressed as a Drizzle
-- `references()` — see the comment on the membership table in schema.ts for why.
ALTER TABLE "membership" ADD CONSTRAINT membership_userid_fkey
  FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE "membership" ENABLE ROW LEVEL SECURITY;

-- USING governs which existing rows are visible (SELECT, and the read side of UPDATE/DELETE):
-- a row is visible if it's in the currently active tenant, OR — the escape hatch — if it belongs
-- to the current user. That second branch exists specifically for TenantContext's own "which
-- tenant do I belong to" lookup, which by definition runs before a tenant is known (see
-- tenant.extension.ts's withUser()).
--
-- WITH CHECK governs new/modified row values (INSERT, and the write side of UPDATE): only the
-- tenant branch applies there, since every write goes through withTenant() once a tenant context
-- is established (including the auto-provisioning hook's own membership insert, which sets the
-- tenant context to the tenant it just created).
CREATE POLICY membership_tenant_isolation ON "membership"
  USING (
    "tenantId"::text = current_setting('app.current_tenant_id', true)
    OR "userId" = current_setting('app.current_user_id', true)
  )
  WITH CHECK (
    "tenantId"::text = current_setting('app.current_tenant_id', true)
  );

-- Unlike membership, subscription is never looked up before a tenant is known (the Stripe webhook
-- always has the tenant id up front, from Checkout/Subscription metadata — see billing.service.ts),
-- so there's no withUser() escape-hatch branch needed here: both sides only ever check the tenant.
ALTER TABLE "subscription" ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscription_tenant_isolation ON "subscription"
  USING ("tenantId"::text = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId"::text = current_setting('app.current_tenant_id', true));

-- Same single-branch shape as subscription above: project is never looked up before a tenant is
-- known, so there's no withUser() escape hatch needed.
ALTER TABLE "project" ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_tenant_isolation ON "project"
  USING ("tenantId"::text = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId"::text = current_setting('app.current_tenant_id', true));
