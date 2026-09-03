import { BUNDLE_CATEGORY } from './types.js';
import type { DiscoveredRecipe, RecipeSelection } from './types.js';

export class RecipeResolutionError extends Error {}

/**
 * Resolves a user's selection against the discovered recipe set into an ordered list
 * to apply: the bundle first (if any), then category recipes sorted by category then id
 * for deterministic output regardless of prompt/selection order.
 */
export function resolveRecipes(
  discovered: DiscoveredRecipe[],
  selection: RecipeSelection,
): DiscoveredRecipe[] {
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

    const missingRequires = (recipe.manifest.requires ?? []).filter((req) => !selectedIds.has(req));
    if (missingRequires.length > 0) {
      throw new RecipeResolutionError(
        `Recipe "${id}" requires ${missingRequires.map((r) => `"${r}"`).join(', ')}, which ` +
          `${missingRequires.length === 1 ? 'is' : 'are'} not selected.`,
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
