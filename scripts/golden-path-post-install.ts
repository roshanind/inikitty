#!/usr/bin/env tsx
/**
 * CI helper: runs each resolved recipe's `postInstall.ts` (building `packages/shared`, starting
 * Docker Postgres, running migrations + the RLS migration) against a project
 * `golden-path-generate.ts` already generated and installed. Split into its own script/step
 * (rather than folded into generation) purely so a CI failure here shows up as its own clearly
 * labeled step in the Actions log.
 *
 * Usage: tsx scripts/golden-path-post-install.ts --out <dir> --project-name <name>
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runPostInstalls } from '../src/engine/postInstall.js';
import type { DiscoveredRecipe } from '../src/engine/types.js';

function arg(name: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  const value = idx === -1 ? undefined : process.argv[idx + 1];
  if (!value) {
    throw new Error(`Missing required --${name} argument.`);
  }
  return value;
}

async function main(): Promise<void> {
  const outputDir = path.resolve(arg('out'));
  const projectName = arg('project-name');

  const raw = await readFile(path.join(outputDir, '.inikitty-ci-recipes.json'), 'utf8');
  const appliedRecipes = JSON.parse(raw) as DiscoveredRecipe[];

  await runPostInstalls(appliedRecipes, { outputDir, projectName });

  console.log(`postInstall complete for "${projectName}" at ${outputDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
