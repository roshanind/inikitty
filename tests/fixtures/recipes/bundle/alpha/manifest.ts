import type { RecipeManifest } from '../../../../../src/engine/types.js';

export const manifest: RecipeManifest = {
  id: 'alpha',
  category: 'bundle',
  description: 'Fixture bundle recipe used by engine unit tests.',
  packageJsonPatch: {
    api: {
      dependencies: { 'alpha-lib': '^1.0.0' },
    },
  },
  envVars: [{ key: 'ALPHA_KEY', example: 'changeme', description: 'Fixture env var' }],
};
