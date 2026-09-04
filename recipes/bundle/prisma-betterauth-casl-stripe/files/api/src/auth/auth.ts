import { PrismaPg } from '@prisma/adapter-pg';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '../generated/prisma/client';
// @inikitty:inject:imports

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set.');
}

// Better Auth's instance is created at module load time, before Nest's DI container exists, so
// it gets its own PrismaClient rather than going through the NestJS-managed PrismaService.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

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
  plugins: [
    // @inikitty:inject:plugins
  ],
});
