import type { RecipeManifest } from '../../../src/engine/types.js';

export const manifest: RecipeManifest = {
  id: 'prisma-betterauth-casl-stripe',
  category: 'bundle',
  description:
    'Golden-path bundle: Prisma + Postgres, Better Auth, CASL, and Stripe wired end to end. ' +
    'Currently implements the auth + Prisma slice only; tenancy/RBAC/billing land in follow-up passes.',
  packageJsonPatch: {
    api: {
      dependencies: {
        'better-auth': '^1.7.2',
        '@thallesp/nestjs-better-auth': '^2.7.0',
        '@prisma/client': '^7.10.0',
        '@prisma/adapter-pg': '^7.10.0',
        // The generated client (custom `output` path) requires this at runtime but pnpm's
        // strict/isolated node_modules won't let it resolve unless it's a direct dependency here.
        '@prisma/client-runtime-utils': '^7.10.0',
        // Pinned explicitly (matching better-auth's own internal dependency) so pnpm resolves a
        // single shared copy instead of a nested one — otherwise TS can't portably name the
        // inferred type of `auth` (TS2742) because it transitively references zod's types.
        zod: '^4.3.6',
      },
      devDependencies: {
        prisma: '^7.10.0',
        // `auth` is Better Auth's own CLI package (replaces the now-deprecated @better-auth/cli),
        // versioned in lockstep with `better-auth` itself.
        auth: '^1.7.2',
      },
    },
  },
  envVars: [
    {
      key: 'DATABASE_URL',
      example: 'postgresql://postgres:postgres@localhost:5432/{{projectNameKebab}}',
      description: 'Postgres connection string (see docker-compose.yml for local defaults)',
    },
    {
      key: 'BETTER_AUTH_SECRET',
      example: 'changeme-generate-a-real-secret',
      description: 'Signing secret for sessions — generate a real one before deploying',
    },
    {
      key: 'BETTER_AUTH_URL',
      example: 'http://localhost:3000',
      description: 'Public base URL of the API (used to build auth callback/redirect URLs)',
    },
  ],
};
