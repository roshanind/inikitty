import type { RecipeManifest } from '../../../src/engine/types.js';

export const manifest: RecipeManifest = {
  id: 'jwt-plugin',
  category: 'auth-extra',
  description:
    'Adds a GET /auth/token endpoint that mints a signed JWT from the current session, for ' +
    'services other than this API that need to independently verify who is logged in. Purely ' +
    'additive — the native session (cookie-based login) works identically with or without this.',
  // Purely additive markers in auth.ts (imports/plugins) exist identically in every
  // better-auth-based bundle — not Prisma-specific — so this is satisfied by either.
  requiresAnyOf: ['prisma-betterauth-casl-stripe', 'drizzle-betterauth-casl-stripe'],
};
