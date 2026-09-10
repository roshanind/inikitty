import { promises as fs } from 'node:fs';
import path from 'node:path';
import { listFilesRecursive, pathExists } from '../../src/engine/fsUtils.js';
import type { DiscoveredRecipe } from '../../src/engine/types.js';

export interface DuplicateFinding {
  recipeAId: string;
  recipeBId: string;
  relativePath: string;
}

async function readOwnTree(recipe: DiscoveredRecipe): Promise<Map<string, Buffer>> {
  const map = new Map<string, Buffer>();
  const roots: Array<['files' | 'inject', string]> = [
    ['files', recipe.filesDir],
    ['inject', recipe.injectDir],
  ];
  for (const [label, dir] of roots) {
    if (!(await pathExists(dir))) continue;
    for (const file of await listFilesRecursive(dir)) {
      const rel = path.join(label, path.relative(dir, file));
      map.set(rel, await fs.readFile(file));
    }
  }
  return map;
}

/**
 * Flags byte-identical files at the same relative path across two different recipes' OWN
 * `files/`+`inject/` trees — deliberately excludes `sharedDirs` content, since that's already
 * deduplicated at the source by design. A hit doesn't necessarily mean "wrong" (see docs-site
 * "Authoring a recipe" > "When to reach for sharedDirs" for the bar), just "worth a look" — this
 * is exactly the manual comparison that found the 49 files later moved into
 * `recipes/shared/betterauth-casl-stripe/`, generalized to run over every recipe pair.
 */
export async function findDuplicateFiles(discovered: DiscoveredRecipe[]): Promise<DuplicateFinding[]> {
  const trees = await Promise.all(discovered.map((r) => readOwnTree(r)));
  const findings: DuplicateFinding[] = [];

  for (let i = 0; i < discovered.length; i++) {
    for (let j = i + 1; j < discovered.length; j++) {
      const recipeA = discovered[i];
      const recipeB = discovered[j];
      const treeA = trees[i];
      const treeB = trees[j];
      if (!recipeA || !recipeB || !treeA || !treeB) continue;

      for (const [rel, contentA] of treeA) {
        const contentB = treeB.get(rel);
        if (contentB && contentA.equals(contentB)) {
          findings.push({ recipeAId: recipeA.manifest.id, recipeBId: recipeB.manifest.id, relativePath: rel });
        }
      }
    }
  }

  return findings;
}
