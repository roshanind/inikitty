export { generate } from './engine/apply.js';
export type { GenerateResult } from './engine/apply.js';
export { discoverRecipes } from './engine/discover.js';
export { resolveRecipes, RecipeResolutionError } from './engine/resolve.js';
export { BUNDLE_CATEGORY } from './engine/types.js';
export type {
  DiscoveredRecipe,
  EnvVarSpec,
  GenerateOptions,
  PackageJsonPatchFragment,
  PostInstallContext,
  PostInstallFn,
  RecipeManifest,
  RecipeSelection,
} from './engine/types.js';
