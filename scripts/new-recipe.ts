#!/usr/bin/env tsx
/**
 * Scaffolds a new recipe folder: recipes/<category>/<id>/manifest.ts, pre-filled with every
 * RecipeManifest field as a commented-out example so an author doesn't have to re-read
 * src/engine/types.ts to see what's available. Doesn't create files/ or inject/ — both are
 * optional, and an empty directory isn't tracked by git anyway; the printed next-steps point at
 * them instead.
 *
 * Usage: tsx scripts/new-recipe.ts <category> <id> [--description "..."]
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathExists } from '../src/engine/fsUtils.js';

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

function manifestTemplate(category: string, id: string, description: string): string {
  return `import type { RecipeManifest } from '../../../src/engine/types.js';

export const manifest: RecipeManifest = {
  id: '${id}',
  category: '${category}',
  description: '${description}',

  // Short display name for the CLI's selection prompt (falls back to the id above if omitted).
  // label: 'Short Name',

  // Recipe ids that can't be selected alongside this one.
  // conflicts: ['some-other-id'],

  // Recipe ids that must ALL also be selected (AND). Prefer requiresAnyOf when you depend on
  // "some bundle with property X" rather than one specific id — see auth-extra/jwt-plugin.
  // requires: ['some-bundle-id'],

  // Satisfied if AT LEAST ONE of these ids is selected (OR).
  // requiresAnyOf: ['bundle-a', 'bundle-b'],

  // Paths (relative to recipesDir) to recipes/shared/<name>/ fragments applied before this
  // recipe's own files/inject — only for content that's genuinely identical across recipes.
  // See docs-site "Authoring a recipe" > "When to reach for sharedDirs".
  // sharedDirs: ['shared/some-shared-fragment'],

  // Merged into api/package.json and/or app/package.json.
  // packageJsonPatch: {
  //   api: { dependencies: { 'some-package': '^1.0.0' } },
  // },

  // Appended at the .env.example marker.
  // envVars: [{ key: 'SOME_KEY', example: 'changeme', description: 'What this is for' }],
};
`;
}

async function main(): Promise<void> {
  const [category, id] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (!category || !id) {
    console.error('Usage: pnpm new-recipe <category> <id> [--description "..."]');
    process.exit(1);
  }

  for (const [label, value] of [
    ['category', category],
    ['id', id],
  ] as const) {
    if (!ID_PATTERN.test(value)) {
      throw new Error(
        `Invalid ${label} "${value}": must be lowercase kebab-case (${ID_PATTERN}), since it becomes a folder name.`,
      );
    }
  }

  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const recipeDir = path.join(repoRoot, 'recipes', category, id);
  if (await pathExists(recipeDir)) {
    throw new Error(`"${path.relative(repoRoot, recipeDir)}" already exists.`);
  }

  const description = arg('description') ?? `TODO: describe what "${id}" adds.`;
  await fs.mkdir(recipeDir, { recursive: true });
  await fs.writeFile(path.join(recipeDir, 'manifest.ts'), manifestTemplate(category, id, description), 'utf8');

  console.log(`Created recipes/${category}/${id}/manifest.ts\n`);
  console.log('Next steps:');
  console.log(`  - Add files under recipes/${category}/${id}/files/ (mirrors the output layout)`);
  console.log('  - Add inject/ snippets for markers you need to graft into (pnpm list-markers shows what exists)');
  console.log('  - Add postInstall.ts if setup needs a script run after install');
  console.log('  - pnpm check-recipes             # validate references before testing');
  console.log('  - pnpm dry-run --bundle <id>     # preview what a selection including this generates');
  console.log('  - docs-site "Authoring a recipe" has the full walkthrough');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
