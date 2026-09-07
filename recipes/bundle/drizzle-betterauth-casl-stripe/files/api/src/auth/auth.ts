import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as appSchema from '../db/schema';
import * as authSchema from '../db/auth-schema';
import { withTenant } from '../tenancy/tenant.extension';
// @inikitty:inject:imports

// Runtime connection, same as DbService — the limited `app_role`, not the migration-only
// superuser. See db.service.ts and enable-rls.sql.
const databaseUrl = process.env.APP_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('APP_DATABASE_URL is not set.');
}

// Better Auth's instance is created at module load time, before Nest's DI container exists, so it
// gets its own Pool/db rather than going through the NestJS-managed DbService. One combined schema
// (auth-generated tables + our own tenant/membership tables) so this single `db` can serve both the
// adapter itself and the signup hook's own tenant/membership inserts below.
const pool = new Pool({ connectionString: databaseUrl });
const db = drizzle(pool, { schema: { ...authSchema, ...appSchema } });

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'workspace';
}

export const auth = betterAuth({
  // `camelCase: true` matches this bundle's own schema.ts convention (e.g. "tenantId", not
  // "tenant_id") — without it, the adapter defaults to snake_case for the tables/columns `npx auth
  // generate` produces, which would leave the auth tables using a different naming convention than
  // every hand-written table in schema.ts. `transaction: true` wraps each multi-step auth operation
  // (e.g. creating a user + its initial account row on signup) in a real Postgres transaction —
  // supported here, unlike the adapter's `false` default which assumes some databases can't.
  database: drizzleAdapter(db, { provider: 'pg', schema: authSchema, camelCase: true, transaction: true }),
  basePath: '/auth',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    // Skipped only under `NODE_ENV=test` (set automatically by Jest, and explicitly by the e2e
    // suite's spawned server) — there's no real inbox to check in a test run, and email delivery
    // is a stub anyway (see below). Real usage always requires it.
    requireEmailVerification: process.env.NODE_ENV !== 'test',
    // Stub email delivery for v1 — swap in a real provider (Resend, Postmark, ...) here before
    // deploying. See docs/product-scope.md §13.
    sendResetPassword: async ({ user, url }) => {
      console.log(`[auth] password reset link for ${user.email}: ${url}`);
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      console.log(`[auth] verification link for ${user.email}: ${url}`);
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Every new signup gets its own tenant, owned by them — the "solo founder" default from
        // product-scope.md §4. Multi-user tenants (inviting teammates) are future work.
        after: async (user) => {
          const [newTenant] = await db
            .insert(appSchema.tenant)
            .values({
              name: `${user.name}'s workspace`,
              slug: `${slugify(user.name)}-${user.id.slice(0, 8)}`,
            })
            .returning();
          // `membership` is RLS-protected; satisfy the insert's WITH CHECK by setting the tenant
          // context to the tenant just created — we know its id, we just made it.
          await withTenant(db, newTenant.id, (tx) =>
            tx.insert(appSchema.membership).values({ userId: user.id, tenantId: newTenant.id, role: 'owner' }),
          );
        },
      },
    },
  },
  plugins: [
    // @inikitty:inject:plugins
  ],
});
