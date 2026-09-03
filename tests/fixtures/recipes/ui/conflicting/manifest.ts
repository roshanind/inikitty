import type { RecipeManifest } from '../../../../../src/engine/types.js';

export const manifest: RecipeManifest = {
  id: 'conflicting',
  category: 'ui',
  description: 'Fixture recipe that conflicts with widgets.',
  conflicts: ['widgets'],
};
