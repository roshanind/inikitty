#!/usr/bin/env tsx
/**
 * Validates every discovered recipe's manifest ahead of writing or running any generation:
 * dangling conflicts/requires/requiresAnyOf references, cross-recipe dependency-version
 * mismatches, and envVar key collisions. `sharedDirs` entries need no separate check here —
 * `discoverRecipes()` already throws if one doesn't exist on disk.
 *
 * Dependency/envVar checks run per-tree (once per backend, once per frontend), since those only
 * ever matter within one axis's own package.json/.env.example. Dangling-reference checking is
 * cross-tree-aware instead: a frontend recipe's `requiresAnyOf` on a backend bundle id is a
 * legitimate cross-axis reference by design (`generateMultiAxis`'s `externallySatisfiedIds`, not
 * this tree's own `discoverRecipes()` set), so every other tree's ids are passed in as
 * `externallyKnownIds` and only a truly unknown id is flagged.
 *
 * Usage: tsx scripts/check-recipes.ts [--recipes-dir <dir>]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverRecipes } from '../src/engine/discover.js';
import { listAllAxisTrees } from './lib/axes.js';
import { checkDanglingReferences, checkDependencyVersionMismatches, checkEnvVarKeyCollisions } from './lib/checkRecipes.js';
import type { DiscoveredRecipe } from '../src/engine/types.js';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

async function main(): Promise<void> {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const recipesDirArg = arg('recipes-dir');

  const trees = recipesDirArg
    ? [{ label: path.relative(repoRoot, path.resolve(recipesDirArg)) || '.', recipesDir: path.resolve(recipesDirArg) }]
    : await listAllAxisTrees(repoRoot);

  const discoveredByTree = await Promise.all(trees.map((tree) => discoverRecipes(tree.recipesDir)));
  const allIds = new Set(discoveredByTree.flat().map((r) => r.manifest.id));

  let totalRecipes = 0;
  let totalErrors = 0;
  let totalWarnings = 0;

  trees.forEach((tree, i) => {
    const discovered = discoveredByTree[i] as DiscoveredRecipe[];
    totalRecipes += discovered.length;
    console.log(`${tree.label}: checked ${discovered.length} recipe(s)`);

    const externallyKnownIds = new Set([...allIds].filter((id) => !discovered.some((r) => r.manifest.id === id)));
    const issues = [
      ...checkDanglingReferences(discovered, externallyKnownIds),
      ...checkDependencyVersionMismatches(discovered),
      ...checkEnvVarKeyCollisions(discovered),
    ];
    for (const issue of issues) {
      console.log(`  [${issue.level}] ${issue.message}`);
    }
    totalErrors += issues.filter((issue) => issue.level === 'error').length;
    totalWarnings += issues.filter((issue) => issue.level === 'warn').length;
  });

  console.log(`\nChecked ${totalRecipes} recipe(s) across ${trees.length} tree(s).`);
  console.log(`${totalErrors} error(s), ${totalWarnings} warning(s).`);

  if (totalErrors > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
