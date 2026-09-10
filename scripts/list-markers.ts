#!/usr/bin/env tsx
/**
 * Lists every `@inikitty:inject:<name>` marker available for a given selection, without running
 * generate(). Markers persist unchanged through the whole apply pipeline until the final
 * stripMarkers() pass, so the union of markers found in the base template's own files plus each
 * resolved recipe's own files/ + sharedDirs is exactly what's available to inject into at any
 * point before that — no need to actually copy or merge anything to compute it.
 *
 * Usage: tsx scripts/list-markers.ts [--bundle <id>] [--categories a,b,c]
 *        tsx scripts/list-markers.ts                        # templates/base only
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverRecipes } from '../src/engine/discover.js';
import { isTextFile, listFilesRecursive, pathExists } from '../src/engine/fsUtils.js';
import { resolveRecipes, RecipeResolutionError } from '../src/engine/resolve.js';

const MARKER_PATTERN = /@inikitty:inject:([A-Za-z0-9_-]+)/g;

interface Layer {
  label: string;
  dir: string;
}

interface Found {
  file: string;
  marker: string;
  source: string;
}

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  return idx === -1 ? undefined : process.argv[idx + 1];
}

async function findMarkers(layer: Layer): Promise<Found[]> {
  if (!(await pathExists(layer.dir))) return [];
  const found: Found[] = [];
  for (const file of (await listFilesRecursive(layer.dir)).filter(isTextFile)) {
    const content = await fs.readFile(file, 'utf8');
    for (const match of content.matchAll(MARKER_PATTERN)) {
      const marker = match[1];
      if (!marker) continue;
      found.push({ file: path.relative(layer.dir, file), marker, source: layer.label });
    }
  }
  return found;
}

async function main(): Promise<void> {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const baseTemplateDir = path.join(repoRoot, 'templates', 'base');
  const recipesDir = path.join(repoRoot, 'recipes');

  const bundle = arg('bundle');
  const categories = (arg('categories') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const layers: Layer[] = [{ label: 'templates/base', dir: baseTemplateDir }];

  if (bundle || categories.length > 0) {
    const discovered = await discoverRecipes(recipesDir);
    let resolved;
    try {
      resolved = resolveRecipes(discovered, { bundle, categories });
    } catch (err) {
      if (err instanceof RecipeResolutionError) {
        console.error(`Invalid selection: ${err.message}`);
        process.exit(1);
      }
      throw err;
    }
    for (const recipe of resolved) {
      for (const shared of recipe.sharedDirs) {
        layers.push({ label: `${recipe.manifest.id} (shared)`, dir: shared.filesDir });
      }
      layers.push({ label: recipe.manifest.id, dir: recipe.filesDir });
    }
  } else {
    console.log(
      '(no selection given — showing templates/base only; pass --bundle/--categories to include recipes)\n',
    );
  }

  const allFound = (await Promise.all(layers.map((layer) => findMarkers(layer)))).flat();
  if (allFound.length === 0) {
    console.log('No markers found.');
    return;
  }

  const byFile = new Map<string, Found[]>();
  for (const found of allFound) {
    byFile.set(found.file, [...(byFile.get(found.file) ?? []), found]);
  }

  for (const [file, entries] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(file);
    for (const entry of entries) {
      console.log(`  @inikitty:inject:${entry.marker}  (shipped by: ${entry.source})`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
