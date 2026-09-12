#!/usr/bin/env tsx
/**
 * Generates a selection into a real temporary directory, prints every resulting file path, then
 * deletes the temp directory (pass --keep to leave it on disk for inspection instead). This
 * reuses the real generateMultiAxis() pipeline rather than re-implementing copy/inject/merge logic
 * separately, so "dry run" here means "leaves nothing behind," not "simulated without touching
 * disk" — the safest way to preview output is to actually run the real thing somewhere disposable.
 *
 * --backend/--frontend are optional when exactly one implementation exists for that axis (the
 * common case today) — omitted, they auto-pick it, same as the CLI skipping its own prompt.
 *
 * Usage: tsx scripts/dry-run.ts [--backend <id>] [--bundle <id>] [--backend-categories a,b]
 *                                [--frontend <id>] [--frontend-categories a,b] [--keep]
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateMultiAxis } from '../src/engine/apply.js';
import { listFilesRecursive } from '../src/engine/fsUtils.js';
import { RecipeResolutionError } from '../src/engine/resolve.js';
import { resolveAxisTree } from './lib/axes.js';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 ? undefined : process.argv[idx + 1];
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function csv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const backendTree = await resolveAxisTree(repoRoot, 'backends', arg('backend'));
  const frontendTree = await resolveAxisTree(repoRoot, 'frontends', arg('frontend'));

  const bundle = arg('bundle');
  const backendCategories = csv(arg('backend-categories'));
  const frontendCategories = csv(arg('frontend-categories'));

  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'inikitty-dry-run-'));
  const outputDir = path.join(parent, 'generated');

  let result;
  try {
    result = await generateMultiAxis({
      outputDir,
      projectName: 'Dry Run App',
      axes: [
        {
          recipesDir: backendTree.recipesDir,
          baseTemplateDir: backendTree.baseTemplateDir,
          selection: { bundle, categories: backendCategories },
        },
        {
          recipesDir: frontendTree.recipesDir,
          baseTemplateDir: frontendTree.baseTemplateDir,
          selection: { categories: frontendCategories },
        },
      ],
      runPostInstall: false,
    });
  } catch (err) {
    await fs.rm(parent, { recursive: true, force: true });
    if (err instanceof RecipeResolutionError) {
      console.error(`Invalid selection: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }

  console.log(`Backend: ${backendTree.label}   Frontend: ${frontendTree.label}`);
  console.log(
    `Applied recipes: ${result.appliedRecipes.map((r) => r.manifest.id).join(', ') || '(none)'}\n`,
  );

  const files = (await listFilesRecursive(outputDir)).map((f) => path.relative(outputDir, f)).sort();
  for (const f of files) console.log(f);
  console.log(`\n${files.length} file(s).`);

  if (flag('keep')) {
    console.log(`\nKept at: ${outputDir}`);
  } else {
    await fs.rm(parent, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
