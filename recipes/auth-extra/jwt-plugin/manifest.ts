import type { RecipeManifest } from '../../../src/engine/types.js';

export const manifest: RecipeManifest = {
  id: 'jwt-plugin',
  category: 'auth-extra',
  description:
    'Adds a GET /auth/token endpoint that mints a signed JWT from the current session, for ' +
    'services other than this API that need to independently verify who is logged in. Purely ' +
    'additive — the native session (cookie-based login) works identically with or without this.',
  requires: ['prisma-betterauth-casl-stripe'],
};
