import type { RecipeManifest } from '../../../../../src/engine/types.js';

// The FE half of the golden path: login/signup, RequireAuth, and the Projects worked example
// (list/detail pages), plus the lib/ wiring they share (api-client, auth-client, query-client,
// the CASL ability hook, MUI theme). Framework-agnostic on the backend side by construction — it
// only ever talks to the REST contract (see docs/product-scope-phase-2.md), so the exact same
// files work unchanged whichever backend implements that contract. requiresAnyOf lists every
// backend bundle id known to implement it; a backend adding an equivalent bundle under the same
// id needs no change here at all (see the naming convention note in the Phase 2 plan).
const caslAppDeps = {
  '@casl/ability': '^6.7.3',
  '{{projectNameKebab}}-shared': 'workspace:*',
};

const projectsAppDeps = {
  // Routing, server-state, and the same Better Auth client library the API uses (its React
  // entrypoint, not the server one).
  'react-router-dom': '^7.18.3',
  '@tanstack/react-query': '^5.102.8',
};

const authAppDeps = {
  'better-auth': '^1.7.2',
  // `app/`'s better-auth resolves as a different peer-variant than the backend's own copy —
  // pnpm gives each variant its own independently-resolved copy of better-auth's internal zod
  // dependency, and the two can land on different patch versions even with byte-identical semver
  // ranges everywhere. Pinning zod directly here too (matching the backend's own pin) collapses
  // both variants back to one shared zod install — verified via a real `pnpm install` +
  // `pnpm why zod` against the NestJS+Prisma pairing; without this, the frontend build fails
  // to portably name `auth`'s inferred type (TS2742).
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
  id: 'betterauth-casl-stripe-pages',
  category: 'pages',
  label: 'Auth + Projects pages',
  description:
    'Login/signup, RequireAuth, and the Projects worked example (list/create/detail pages), ' +
    'wired to whichever backend bundle implements the Better Auth + CASL + Stripe contract.',
  // Backend-agnostic on purpose: any backend bundle implementing this contract satisfies it,
  // under the same id/label convention (see docs/product-scope-phase-2.md's naming-convention
  // note) — a backend never needs to be listed here individually.
  requiresAnyOf: ['prisma-betterauth-casl-stripe', 'drizzle-betterauth-casl-stripe'],
  packageJsonPatch: {
    app: {
      dependencies: {
        ...caslAppDeps,
        ...projectsAppDeps,
        ...authAppDeps,
        ...uiAppDeps,
      },
    },
  },
};
