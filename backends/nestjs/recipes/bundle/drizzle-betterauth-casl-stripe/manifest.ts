import type { RecipeManifest } from '../../../src/engine/types.js';

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
  'drizzle-orm': '^0.45.2',
  pg: '^8.23.0',
  // better-auth's own drizzle adapter re-exports from this package (confirmed by inspecting
  // better-auth's actual dist, not just its docs — `better-auth/adapters/drizzle` is a thin
  // `export *` from here). Pinned as a direct dependency for the same pnpm-strict-node_modules
  // reason as zod below: it's a real dependency of better-auth, but auth.ts's own inferred
  // types need it resolvable directly, not just transitively.
  '@better-auth/drizzle-adapter': '^1.7.2',
  // cuid()-style ids, matching the Prisma bundle's default id shape for parity — Drizzle has
  // no built-in id generator of its own.
  '@paralleldrive/cuid2': '^3.3.0',
};

const caslApiDeps = {
  // Type-checking `PolicyHandler`/`AppAbility` (re-exported from the shared package below)
  // needs this resolvable directly — same pnpm strict-node_modules reasoning as zod above.
  '@casl/ability': '^6.7.3',
  // Workspace-linked package (see pnpm-workspace.yaml) holding the CASL action/subject
  // vocabulary and `defineAbilityFor`, shared as-is with app/ so ability rules aren't
  // duplicated per side. Identical package to the Prisma bundle's — it has no ORM dependency.
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
  'drizzle-kit': '^0.31.10',
  '@types/pg': '^8.23.1',
};

const authApiDevDeps = {
  // `auth` is Better Auth's own CLI package (replaces the now-deprecated @better-auth/cli),
  // versioned in lockstep with `better-auth` itself.
  auth: '^1.7.2',
};

const caslAppDeps = {
  '@casl/ability': '^6.7.3',
  '{{projectNameKebab}}-shared': 'workspace:*',
};

const projectsAppDeps = {
  // FE half of the Projects worked example: routing, server-state, and the same Better
  // Auth client library the API uses (its React entrypoint, not the server one).
  'react-router-dom': '^7.18.3',
  '@tanstack/react-query': '^5.102.8',
};

const authAppDeps = {
  'better-auth': '^1.7.2',
  // `app/`'s better-auth resolves as a different peer-variant than `api/`'s (api/ also has
  // drizzle-orm/pg as peers, app/ doesn't) — pnpm gives each variant its own
  // independently-resolved copy of better-auth's internal zod dependency, and the two can
  // land on different patch versions even with byte-identical semver ranges everywhere.
  // Pinning zod directly here too (matching api/'s own pin) collapses both variants back to
  // one shared zod install — same gotcha the Prisma bundle hit, verified there via a real
  // `pnpm install` + `pnpm why zod`; without this, `nest build` fails with TS2742 on
  // `auth.ts`'s inferred type.
  zod: '^4.3.6',
};

const uiAppDeps = {
  // UI library for the golden path (Phase 1 bakes in one default — see
  // docs/product-scope.md §12; a pluggable UI-library *choice* is Phase 2).
  '@mui/material': '^9.4.0',
  '@emotion/react': '^11.14.0',
  '@emotion/styled': '^11.14.1',
};

export const manifest: RecipeManifest = {
  id: 'drizzle-betterauth-casl-stripe',
  category: 'bundle',
  label: 'Drizzle',
  description:
    'Golden-path bundle, Drizzle variant: Drizzle ORM + Postgres, Better Auth, CASL, Stripe, and ' +
    'Material UI wired end to end. Same guarantees as prisma-betterauth-casl-stripe (multi-tenancy ' +
    'via Postgres RLS, CASL RBAC enforcement, Stripe billing, the Projects example resource) ' +
    'reimplemented against Drizzle instead of Prisma — see recipes/README.md for where the two ' +
    "bundles' designs genuinely diverge (there's no Prisma-Client-Extension equivalent in Drizzle).",
  // Everything ORM-agnostic (CASL guard, billing controller, Projects DTOs/controller, the FE
  // pages, packages/shared, docker-compose.yml, etc.) lives once in shared/betterauth-casl-stripe
  // and is shared with the Prisma bundle — see that directory's own comment for why.
  sharedDirs: ['shared/betterauth-casl-stripe'],
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
      // real .mjs file even with a transform configured (see recipes/README.md). Redirects any
      // unit test's import of it to a manual mock instead — real auth behavior is covered by
      // test/golden-path.e2e-spec.ts, which spawns the real compiled server and never goes
      // through Jest's module loader for it at all.
      jestModuleNameMapper: {
        '^@thallesp/nestjs-better-auth$': '<rootDir>/test/__mocks__/thallesp-nestjs-better-auth.ts',
      },
    },
    app: {
      dependencies: {
        ...caslAppDeps,
        ...projectsAppDeps,
        ...authAppDeps,
        ...uiAppDeps,
      },
    },
  },
  envVars: [
    // --- Postgres / Drizzle ---
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
        'row-level security. Created by postInstall\'s enable-rls.sql step; rotate the password for real deployments.',
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
