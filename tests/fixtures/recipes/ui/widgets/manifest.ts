import type { RecipeManifest } from '../../../../../src/engine/types.js';

export const manifest: RecipeManifest = {
  id: 'widgets',
  category: 'ui',
  description: 'Fixture UI category recipe.',
  packageJsonPatch: {
    app: {
      dependencies: { 'widgets-lib': '^2.0.0' },
    },
  },
};
