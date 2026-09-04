import type { RecipeManifest } from '../../../src/engine/types.js';

export const manifest: RecipeManifest = {
  id: 'prisma-betterauth-casl-stripe',
  category: 'bundle',
  description:
    'Golden-path bundle: Prisma + Postgres, Better Auth, CASL, and Stripe wired end to end. ' +
    'Currently implements auth + Prisma, multi-tenancy (Postgres RLS), and CASL RBAC enforcement; ' +
    'Stripe billing and the Projects example resource land in follow-up passes.',
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
        // Type-checking `PolicyHandler`/`AppAbility` (re-exported from the shared package below)
        // needs this resolvable directly — same pnpm strict-node_modules reasoning as zod above.
        '@casl/ability': '^6.7.3',
        // Workspace-linked package (see pnpm-workspace.yaml) holding the CASL action/subject
        // vocabulary and `defineAbilityFor`, shared as-is with app/ so ability rules aren't
        // duplicated per side.
        '{{projectNameKebab}}-shared': 'workspace:*',
      },
      devDependencies: {
        prisma: '^7.10.0',
        // `auth` is Better Auth's own CLI package (replaces the now-deprecated @better-auth/cli),
        // versioned in lockstep with `better-auth` itself.
        auth: '^1.7.2',
      },
    },
    app: {
      dependencies: {
        '@casl/ability': '^6.7.3',
        '{{projectNameKebab}}-shared': 'workspace:*',
      },
    },
  },
  envVars: [
    {
      key: 'DATABASE_URL',
      example: 'postgresql://postgres:postgres@localhost:5432/{{projectNameKebab}}',
      description:
        'Migration-only, superuser connection (see docker-compose.yml). The running app never ' +
        'uses this — see APP_DATABASE_URL — so that Postgres row-level security actually applies.',
    },
    {
      key: 'APP_DATABASE_URL',
      example: 'postgresql://app_role:changeme-app-role-password@localhost:5432/{{projectNameKebab}}',
      description:
        'What the running app actually connects with — a limited, non-superuser role subject to ' +
        'row-level security. Created by the enable-rls migration; rotate the password for real deployments.',
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
