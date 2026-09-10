#!/usr/bin/env tsx
/**
 * Generates a selection into a real temporary directory, prints every resulting file path, then
 * deletes the temp directory (pass --keep to leave it on disk for inspection instead). This
 * reuses the real generate() pipeline rather than re-implementing copy/inject/merge logic
 * separately, so "dry run" here means "leaves nothing behind," not "simulated without touching
 * disk" — the safest way to preview output is to actually run the real thing somewhere disposable.
 *
 * Usage: tsx scripts/dry-run.ts --bundle <id> [--categories a,b,c] [--keep]
 *        tsx scripts/dry-run.ts --categories a,b,c        # if no bundle exists/is required
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generate } from '../src/engine/apply.js';
import { listFilesRecursive } from '../src/engine/fsUtils.js';
import { RecipeResolutionError } from '../src/engine/resolve.js';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 ? undefined : process.argv[idx + 1];
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const bundle = arg('bundle');
  const categories = (arg('categories') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'inikitty-dry-run-'));
  const outputDir = path.join(parent, 'generated');

  let result;
  try {
    result = await generate({
      outputDir,
      projectName: 'Dry Run App',
      selection: { bundle, categories },
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
