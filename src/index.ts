export { applyRecipesToOutput, finalizeOutput, generate, generateMultiAxis } from './engine/apply.js';
export type {
  ApplyRecipesToOutputOptions,
  AxisOptions,
  FinalizeOutputOptions,
  GenerateMultiAxisOptions,
  GenerateMultiAxisResult,
  GenerateResult,
} from './engine/apply.js';
export { discoverRecipes } from './engine/discover.js';
export { runPostInstalls } from './engine/postInstall.js';
export { resolveRecipes, RecipeResolutionError } from './engine/resolve.js';
export type { ResolveRecipesOptions } from './engine/resolve.js';
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
