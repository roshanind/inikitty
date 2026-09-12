-- Not run directly — postInstall.ts copies this into a real, timestamped Prisma migration folder
-- (created after "init") so it's tracked in _prisma_migrations and replays correctly on
-- `prisma migrate deploy` in any environment, not just this dev machine.

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

-- Real referential integrity for membership.userId -> user.id. Not expressed as a Prisma
-- @relation — see the comment on the Membership model in schema.prisma for why.
ALTER TABLE "membership" ADD CONSTRAINT membership_userid_fkey
  FOREIGN KEY ("userId") REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE "membership" ENABLE ROW LEVEL SECURITY;

-- USING governs which existing rows are visible (SELECT, and the read side of UPDATE/DELETE):
-- a row is visible if it's in the currently active tenant, OR — the escape hatch — if it belongs
-- to the current user. That second branch exists specifically for TenantContext's own "which
-- tenant do I belong to" lookup, which by definition runs before a tenant is known (see
-- tenant.extension.ts's forUser()).
--
-- WITH CHECK governs new/modified row values (INSERT, and the write side of UPDATE): only the
-- tenant branch applies there, since every write goes through forTenant() once a tenant context
-- is established (including the auto-provisioning hook's own membership insert, which sets the
-- tenant context to the tenant it just created).
CREATE POLICY membership_tenant_isolation ON "membership"
  USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    OR "userId" = current_setting('app.current_user_id', true)
  )
  WITH CHECK (
    "tenantId" = current_setting('app.current_tenant_id', true)
  );

-- Unlike membership, subscription is never looked up before a tenant is known (the Stripe webhook
-- always has the tenant id up front, from Checkout/Subscription metadata — see billing.service.ts),
-- so there's no forUser() escape-hatch branch needed here: both sides only ever check the tenant.
ALTER TABLE "subscription" ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscription_tenant_isolation ON "subscription"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));

-- Same single-branch shape as subscription above: project is never looked up before a tenant is
-- known, so there's no forUser() escape hatch needed.
ALTER TABLE "project" ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_tenant_isolation ON "project"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
