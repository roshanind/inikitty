#!/usr/bin/env tsx
/**
 * Validates every discovered recipe's manifest ahead of writing or running any generation:
 * dangling conflicts/requires/requiresAnyOf references, cross-recipe dependency-version
 * mismatches, and envVar key collisions. `sharedDirs` entries need no separate check here —
 * `discoverRecipes()` already throws if one doesn't exist on disk.
 *
 * Usage: tsx scripts/check-recipes.ts [--recipes-dir <dir>]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverRecipes } from '../src/engine/discover.js';
import { checkAll } from './lib/checkRecipes.js';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

async function main(): Promise<void> {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const recipesDirArg = arg('recipes-dir');
  const recipesDir = recipesDirArg ? path.resolve(recipesDirArg) : path.join(repoRoot, 'recipes');

  const discovered = await discoverRecipes(recipesDir);
  console.log(`Checked ${discovered.length} recipe(s) under ${path.relative(repoRoot, recipesDir) || '.'}\n`);

  const issues = checkAll(discovered);
  if (issues.length === 0) {
    console.log('No issues found.');
    return;
  }

  for (const issue of issues) {
    console.log(`  [${issue.level}] ${issue.message}`);
  }

  const errorCount = issues.filter((i) => i.level === 'error').length;
  const warnCount = issues.length - errorCount;
  console.log(`\n${errorCount} error(s), ${warnCount} warning(s).`);

  if (errorCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
