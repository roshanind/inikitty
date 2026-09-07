import type { RecipeManifest } from '../../../../../src/engine/types.js';

export const manifest: RecipeManifest = {
  id: 'needs-alpha-or-beta',
  category: 'extra',
  description: 'Fixture recipe requiring either the alpha or beta bundle.',
  requiresAnyOf: ['alpha', 'beta'],
};
