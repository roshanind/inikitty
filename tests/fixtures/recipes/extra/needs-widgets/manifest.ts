import type { RecipeManifest } from '../../../../../src/engine/types.js';

export const manifest: RecipeManifest = {
  id: 'needs-widgets',
  category: 'extra',
  description: 'Fixture recipe requiring the widgets category recipe.',
  requires: ['widgets'],
};
