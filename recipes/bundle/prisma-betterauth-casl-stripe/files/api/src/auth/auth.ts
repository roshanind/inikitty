import { PrismaPg } from '@prisma/adapter-pg';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '../generated/prisma/client';
import { forTenant } from '../tenancy/tenant.extension';
// @inikitty:inject:imports

// Runtime connection, same as PrismaService — the limited `app_role`, not the migration-only
// superuser. See prisma.service.ts and enable-rls.sql.
const databaseUrl = process.env.APP_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('APP_DATABASE_URL is not set.');
}

// Better Auth's instance is created at module load time, before Nest's DI container exists, so
// it gets its own PrismaClient rather than going through the NestJS-managed PrismaService.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'workspace';
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  basePath: '/auth',
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
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
          const tenant = await prisma.tenant.create({
            data: {
              name: `${user.name}'s workspace`,
              slug: `${slugify(user.name)}-${user.id.slice(0, 8)}`,
            },
          });
          // `membership` is RLS-protected; satisfy the insert's WITH CHECK by setting the tenant
          // context to the tenant just created — we know its id, we just made it.
          await prisma.$extends(forTenant(tenant.id)).membership.create({
            data: { userId: user.id, tenantId: tenant.id, role: 'owner' },
          });
        },
      },
    },
  },
  plugins: [
    // @inikitty:inject:plugins
  ],
});
