import type { RecipeManifest } from '../../../../../src/engine/types.js';

// Grouped by the module each dependency actually belongs to (not the file's own directory
// structure, which — unlike this manifest — already mirrors that grouping: files/api/src/auth/,
// .../billing/, .../casl/, .../tenancy/, .../projects/). This is the flat, interleaved
// dependency/envVar list those directories don't have an equivalent for.

const authApiDeps = {
  'better-auth': '^1.7.2',
  '@thallesp/nestjs-better-auth': '^2.7.0',
  // Pinned explicitly (matching better-auth's own internal dependency) so pnpm resolves a
  // single shared copy instead of a nested one — otherwise TS can't portably name the
  // inferred type of `auth` (TS2742) because it transitively references zod's types.
  zod: '^4.3.6',
};

const ormApiDeps = {
  '@prisma/client': '^7.10.0',
  '@prisma/adapter-pg': '^7.10.0',
  // The generated client (custom `output` path) requires this at runtime but pnpm's
  // strict/isolated node_modules won't let it resolve unless it's a direct dependency here.
  '@prisma/client-runtime-utils': '^7.10.0',
};

const caslApiDeps = {
  // Type-checking `PolicyHandler`/`AppAbility` (re-exported from the shared package below)
  // needs this resolvable directly — same pnpm strict-node_modules reasoning as zod above.
  '@casl/ability': '^6.7.3',
  // Workspace-linked package (see pnpm-workspace.yaml) holding the CASL action/subject
  // vocabulary and `defineAbilityFor`, shared as-is with app/ so ability rules aren't
  // duplicated per side.
  '{{projectNameKebab}}-shared': 'workspace:*',
};

const billingApiDeps = {
  stripe: '^22.6.1',
};

const infraApiDeps = {
  // bodyParser is disabled at the Nest app level (see main.ts) for Better Auth's sake, so
  // main.ts's own middleware imports `express` directly to restore JSON parsing for
  // everything else / raw parsing for the Stripe webhook — pnpm's strict node_modules needs
  // it as a direct dependency here, not just a transitive one via @nestjs/platform-express.
  express: '^5.1.0',
};

const ormApiDevDeps = {
  prisma: '^7.10.0',
};

const authApiDevDeps = {
  // `auth` is Better Auth's own CLI package (replaces the now-deprecated @better-auth/cli),
  // versioned in lockstep with `better-auth` itself.
  auth: '^1.7.2',
};

export const manifest: RecipeManifest = {
  id: 'prisma-betterauth-casl-stripe',
  category: 'bundle',
  label: 'Prisma',
  description:
    'Golden-path bundle: Prisma + Postgres, Better Auth, CASL, Stripe, and Material UI wired end ' +
    'to end. Implements auth + Prisma, multi-tenancy (Postgres RLS), CASL RBAC enforcement, ' +
    'Stripe billing (Checkout, Customer Portal, webhook-driven Subscription sync), and the ' +
    'Projects example resource (tenant-scoped, RBAC-guarded CRUD with MUI-based FE ' +
    'list/create/detail pages) end to end.',
  // Everything backend-agnostic-in-web-framework-but-not-ORM (CASL guard, billing controller,
  // Projects DTOs/controller, packages/shared, docker-compose.yml, etc.) lives once in
  // backends/shared/betterauth-casl-stripe and is shared with the Drizzle bundle, rather than
  // being hand-copied — see that directory's own comment for why. The FE pages that used to live
  // alongside this now live in frontends/react-vite/recipes/pages/betterauth-casl-stripe-pages/,
  // which requiresAnyOf this bundle's id instead — a frontend recipe, not part of this bundle,
  // since the FE pages don't care whether this backend or Express implements the same contract.
  sharedDirs: ['../../shared/betterauth-casl-stripe'],
  packageJsonPatch: {
    api: {
      dependencies: {
        ...authApiDeps,
        ...ormApiDeps,
        ...caslApiDeps,
        ...billingApiDeps,
        ...infraApiDeps,
      },
      devDependencies: {
        ...ormApiDevDeps,
        ...authApiDevDeps,
      },
      // `@thallesp/nestjs-better-auth` ships ESM-only; Jest's CommonJS test runner can't load a
      // real .mjs file even with a transform configured (see backends/nestjs/recipes/README.md).
      // Redirects any unit test's import of it to a manual mock instead — real auth behavior is
      // covered by test/golden-path.e2e-spec.ts, which spawns the real compiled server and never
      // goes through Jest's module loader for it at all.
      jestModuleNameMapper: {
        '^@thallesp/nestjs-better-auth$': '<rootDir>/test/__mocks__/thallesp-nestjs-better-auth.ts',
      },
    },
  },
  envVars: [
    // --- Postgres / Prisma ---
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
    // --- Auth (Better Auth) ---
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
    // --- App / frontend ---
    {
      key: 'APP_URL',
      example: 'http://localhost:5173',
      description: 'Public base URL of the frontend — used to build Checkout/Portal redirect URLs',
    },
    // --- Billing (Stripe) ---
    {
      key: 'STRIPE_SECRET_KEY',
      example: 'sk_test_changeme',
      description: 'Stripe secret API key (test-mode key for local dev; find it in the Stripe dashboard)',
    },
    {
      key: 'STRIPE_WEBHOOK_SECRET',
      example: 'whsec_changeme',
      description:
        'Signing secret for the /billing/webhook endpoint — for local dev, run `stripe listen ' +
        '--forward-to localhost:3000/billing/webhook` and use the secret it prints',
    },
  ],
};
