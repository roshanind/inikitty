import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createJiti } from 'jiti';
import { pathExists } from './fsUtils.js';
import type { DiscoveredRecipe, RecipeManifest } from './types.js';

// Recipe manifest/postInstall files ship as raw .ts (for author-side type safety against
// RecipeManifest) and must load both under vitest and from the plain-Node built CLI. jiti
// transpiles on the fly in either context, so no separate compile step is needed for recipes.
const jiti = createJiti(import.meta.url);

async function loadManifest(manifestPath: string): Promise<RecipeManifest> {
  const mod = await jiti.import(manifestPath);
  const manifest = (mod as { manifest?: RecipeManifest; default?: RecipeManifest }).manifest
    ?? (mod as { default?: RecipeManifest }).default;
  if (!manifest || typeof manifest !== 'object') {
    throw new Error(
      `Recipe manifest at "${manifestPath}" must export a default or named "manifest" export.`,
    );
  }
  if (!manifest.id || !manifest.category) {
    throw new Error(`Recipe manifest at "${manifestPath}" must have both "id" and "category".`);
  }
  return manifest;
}

/**
 * Scans `<recipesDir>/<category>/<id>/manifest.ts` and loads each recipe found.
 * Returns an empty array if `recipesDir` doesn't exist — that's a valid state (no recipes yet).
 */
export async function discoverRecipes(recipesDir: string): Promise<DiscoveredRecipe[]> {
  if (!(await pathExists(recipesDir))) return [];

  const discovered: DiscoveredRecipe[] = [];
  const categoryEntries = await fs.readdir(recipesDir, { withFileTypes: true });

  for (const categoryEntry of categoryEntries) {
    if (!categoryEntry.isDirectory()) continue;
    const categoryDir = path.join(recipesDir, categoryEntry.name);
    const idEntries = await fs.readdir(categoryDir, { withFileTypes: true });

    for (const idEntry of idEntries) {
      if (!idEntry.isDirectory()) continue;
      const recipeDir = path.join(categoryDir, idEntry.name);
      const manifestPath = path.join(recipeDir, 'manifest.ts');
      if (!(await pathExists(manifestPath))) continue;

      const manifest = await loadManifest(manifestPath);
      if (manifest.category !== categoryEntry.name) {
        throw new Error(
          `Recipe at "${recipeDir}" declares category "${manifest.category}" but lives under ` +
            `the "${categoryEntry.name}" folder — these must match.`,
        );
      }
      if (manifest.id !== idEntry.name) {
        throw new Error(
          `Recipe at "${recipeDir}" declares id "${manifest.id}" but lives in a folder named ` +
            `"${idEntry.name}" — these must match.`,
        );
      }

      const postInstallPath = path.join(recipeDir, 'postInstall.ts');
      discovered.push({
        manifest,
        dir: recipeDir,
        filesDir: path.join(recipeDir, 'files'),
        injectDir: path.join(recipeDir, 'inject'),
        postInstallPath: (await pathExists(postInstallPath)) ? postInstallPath : undefined,
      });
    }
  }

  return discovered;
}
