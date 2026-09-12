import { BUNDLE_CATEGORY } from './types.js';
import type { DiscoveredRecipe, RecipeSelection } from './types.js';

export class RecipeResolutionError extends Error {}

export interface ResolveRecipesOptions {
  /** Recipe ids resolved by another axis (e.g. a backend's bundle, when resolving a frontend's
   * selection in a multi-axis generation) — consulted only for `requires`/`requiresAnyOf` checks,
   * never `conflicts`. Lets a recipe in one axis depend on a recipe in another without either
   * axis's `discoverRecipes()` call needing to see the other axis's recipes at all. Omitted by
   * every single-axis caller; empty by default, so this is a no-op unless multi-axis generation
   * explicitly opts in. */
  externallySatisfiedIds?: Set<string>;
}

/**
 * Resolves a user's selection against the discovered recipe set into an ordered list
 * to apply: the bundle first (if any), then category recipes sorted by category then id
 * for deterministic output regardless of prompt/selection order.
 */
export function resolveRecipes(
  discovered: DiscoveredRecipe[],
  selection: RecipeSelection,
  options: ResolveRecipesOptions = {},
): DiscoveredRecipe[] {
  const externallySatisfiedIds = options.externallySatisfiedIds ?? new Set<string>();
  const byId = new Map(discovered.map((r) => [r.manifest.id, r]));
  const availableBundles = discovered.filter((r) => r.manifest.category === BUNDLE_CATEGORY);

  if (selection.bundle && !byId.has(selection.bundle)) {
    throw new RecipeResolutionError(`Unknown bundle recipe: "${selection.bundle}".`);
  }
  if (selection.bundle && byId.get(selection.bundle)?.manifest.category !== BUNDLE_CATEGORY) {
    throw new RecipeResolutionError(`Recipe "${selection.bundle}" is not a bundle recipe.`);
  }
  if (!selection.bundle && availableBundles.length > 0) {
    throw new RecipeResolutionError(
      `A bundle recipe must be selected (available: ${availableBundles.map((r) => r.manifest.id).join(', ')}).`,
    );
  }

  const selectedIds = new Set<string>(selection.categories);
  if (selection.bundle) selectedIds.add(selection.bundle);

  for (const id of selection.categories) {
    const recipe = byId.get(id);
    if (!recipe) {
      throw new RecipeResolutionError(`Unknown recipe: "${id}".`);
    }
    if (recipe.manifest.category === BUNDLE_CATEGORY) {
      throw new RecipeResolutionError(
        `"${id}" is a bundle recipe and can't be selected as a category recipe.`,
      );
    }
  }

  for (const id of selectedIds) {
    const recipe = byId.get(id);
    if (!recipe) continue;

    const isSatisfied = (req: string) => selectedIds.has(req) || externallySatisfiedIds.has(req);

    const missingRequires = (recipe.manifest.requires ?? []).filter((req) => !isSatisfied(req));
    if (missingRequires.length > 0) {
      throw new RecipeResolutionError(
        `Recipe "${id}" requires ${missingRequires.map((r) => `"${r}"`).join(', ')}, which ` +
          `${missingRequires.length === 1 ? 'is' : 'are'} not selected.`,
      );
    }

    const anyOf = recipe.manifest.requiresAnyOf ?? [];
    if (anyOf.length > 0 && !anyOf.some(isSatisfied)) {
      throw new RecipeResolutionError(
        `Recipe "${id}" requires one of ${anyOf.map((r) => `"${r}"`).join(', ')}, none of which are selected.`,
      );
    }

    for (const conflictId of recipe.manifest.conflicts ?? []) {
      if (selectedIds.has(conflictId)) {
        throw new RecipeResolutionError(`Recipe "${id}" conflicts with selected recipe "${conflictId}".`);
      }
    }
  }

  const categoryRecipes = discovered
    .filter((r) => selectedIds.has(r.manifest.id) && r.manifest.category !== BUNDLE_CATEGORY)
    .sort((a, b) => {
      const catCompare = a.manifest.category.localeCompare(b.manifest.category);
      return catCompare !== 0 ? catCompare : a.manifest.id.localeCompare(b.manifest.id);
    });

  const bundleRecipe = selection.bundle ? byId.get(selection.bundle) : undefined;
  return bundleRecipe ? [bundleRecipe, ...categoryRecipes] : categoryRecipes;
}
