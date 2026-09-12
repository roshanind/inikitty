#!/usr/bin/env tsx
/**
 * Prints a JSON array of every discovered {backend, bundle} pair, e.g.
 * `[{"backend":"nestjs","bundle":"prisma-betterauth-casl-stripe"}, ...]`. Used by CI to build a
 * matrix so the golden-path check automatically covers every backend's bundle, not just the ones
 * that exist today — the same "discover, don't hardcode" pattern `list-bundles.ts` used before
 * backends became their own axis (see docs/product-scope-phase-2.md).
 *
 * Walks `backends/*\/recipes/` directly rather than a single `recipesDir`, since each backend now
 * has its own. `backends/shared/` (a sharedDirs fragment, not a real backend) has no `recipes/`
 * subdirectory at all, so `discoverRecipes()` returns `[]` for it — no special-casing needed.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverRecipes } from '../src/engine/discover.js';
import { BUNDLE_CATEGORY } from '../src/engine/types.js';

interface BackendBundlePair {
  backend: string;
  bundle: string;
}

async function main(): Promise<void> {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const backendsDir = path.join(repoRoot, 'backends');
  const entries = await fs.readdir(backendsDir, { withFileTypes: true });

  const pairs: BackendBundlePair[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const recipesDir = path.join(backendsDir, entry.name, 'recipes');
    const discovered = await discoverRecipes(recipesDir);
    for (const recipe of discovered) {
      if (recipe.manifest.category === BUNDLE_CATEGORY) {
        pairs.push({ backend: entry.name, bundle: recipe.manifest.id });
      }
    }
  }
  process.stdout.write(JSON.stringify(pairs));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
