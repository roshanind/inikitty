#!/usr/bin/env tsx
/**
 * Prints a JSON array of every discovered bundle recipe's id, e.g. `["prisma-betterauth-casl-stripe"]`.
 * Used by CI to build a matrix so the golden-path check automatically covers every bundle that
 * exists, not just the one that exists today — per CLAUDE.md's "the golden-path CI check should
 * run once per available bundle" requirement.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverRecipes } from '../src/engine/discover.js';
import { BUNDLE_CATEGORY } from '../src/engine/types.js';

async function main(): Promise<void> {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const recipesDir = path.join(repoRoot, 'recipes');
  const discovered = await discoverRecipes(recipesDir);
  const bundleIds = discovered
    .filter((recipe) => recipe.manifest.category === BUNDLE_CATEGORY)
    .map((recipe) => recipe.manifest.id);
  process.stdout.write(JSON.stringify(bundleIds));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
