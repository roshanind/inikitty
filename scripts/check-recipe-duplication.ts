#!/usr/bin/env tsx
/**
 * Flags byte-identical files across two different recipes' own files/+inject/ trees (sharedDirs
 * content is excluded — it's deliberately shared already). Running this regularly catches new
 * duplication before it calcifies into two hand-maintained copies, the way the Prisma/Drizzle
 * bundles' 49 identical files did before `sharedDirs` existed. Informational, not a hard failure —
 * see docs-site "Authoring a recipe" > "When to reach for sharedDirs" for when a hit is actually
 * worth extracting versus a coincidence.
 *
 * Usage: tsx scripts/check-recipe-duplication.ts [--recipes-dir <dir>]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverRecipes } from '../src/engine/discover.js';
import { findDuplicateFiles } from './lib/checkDuplication.js';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

async function main(): Promise<void> {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const recipesDirArg = arg('recipes-dir');
  const recipesDir = recipesDirArg ? path.resolve(recipesDirArg) : path.join(repoRoot, 'recipes');

  const discovered = await discoverRecipes(recipesDir);
  const findings = await findDuplicateFiles(discovered);

  if (findings.length === 0) {
    console.log(
      `No byte-identical files found across ${discovered.length} recipes' own files/+inject/ trees.`,
    );
    return;
  }

  const byPair = new Map<string, string[]>();
  for (const finding of findings) {
    const key = `${finding.recipeAId} <-> ${finding.recipeBId}`;
    byPair.set(key, [...(byPair.get(key) ?? []), finding.relativePath]);
  }

  for (const [pair, paths] of byPair) {
    console.log(`\n${pair} (${paths.length} identical file(s)):`);
    for (const p of paths) console.log(`  ${p}`);
  }

  console.log(
    `\n${findings.length} identical file(s) across ${byPair.size} recipe pair(s). If these are ` +
      'genuinely identical for a structural reason (not a coincidence), consider recipes/shared/ ' +
      '+ sharedDirs — see docs-site "Authoring a recipe".',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
