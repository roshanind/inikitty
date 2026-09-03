import type { RecipeManifest } from '../../../../../src/engine/types.js';

export const manifest: RecipeManifest = {
  id: 'needs-alpha',
  category: 'extra',
  description: 'Fixture recipe requiring the alpha bundle.',
  requires: ['alpha'],
};
