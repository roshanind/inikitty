import type { RecipeManifest } from '../../../../../../src/engine/types.js';

export const manifest: RecipeManifest = {
  id: 'needs-alpha',
  category: 'extra',
  description: 'Fixture frontend category recipe requiring a backend-axis bundle id.',
  requiresAnyOf: ['alpha'],
};
