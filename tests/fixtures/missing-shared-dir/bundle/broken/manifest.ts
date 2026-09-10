import type { RecipeManifest } from '../../../../../src/engine/types.js';

export const manifest: RecipeManifest = {
  id: 'broken',
  category: 'bundle',
  description: 'Fixture recipe with a sharedDirs entry that does not exist, for discover.ts error coverage.',
  sharedDirs: ['shared/does-not-exist'],
};
