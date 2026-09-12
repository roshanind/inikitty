#!/usr/bin/env tsx
/**
 * Lists every `@inikitty:inject:<name>` marker available for a given selection, without running
 * generate(). Markers persist unchanged through the whole apply pipeline until the final
 * stripMarkers() pass, so the union of markers found in templates/root plus each axis's own base
 * template and each resolved recipe's own files/ + sharedDirs is exactly what's available to
 * inject into at any point before that — no need to actually copy or merge anything to compute it.
 *
 * --backend/--frontend are optional when exactly one implementation exists for that axis.
 *
 * Usage: tsx scripts/list-markers.ts [--backend <id>] [--bundle <id>] [--backend-categories a,b]
 *                                     [--frontend <id>] [--frontend-categories a,b]
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTextFile, listFilesRecursive, pathExists } from '../src/engine/fsUtils.js';
import { discoverRecipes } from '../src/engine/discover.js';
import { resolveRecipes, RecipeResolutionError } from '../src/engine/resolve.js';
import { resolveAxisTree } from './lib/axes.js';

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
function csv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
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
  const rootTemplateDir = path.join(repoRoot, 'templates', 'root');

  const layers: Layer[] = [{ label: 'templates/root', dir: rootTemplateDir }];

  let satisfiedSoFar = new Set<string>();
  for (const [kind, axisFlag, bundleArg, categoriesArg] of [
    ['backends', 'backend', 'bundle', 'backend-categories'],
    ['frontends', 'frontend', undefined, 'frontend-categories'],
  ] as const) {
    let tree;
    try {
      tree = await resolveAxisTree(repoRoot, kind, arg(axisFlag));
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    layers.push({ label: tree.label, dir: tree.baseTemplateDir });

    const bundle = bundleArg ? arg(bundleArg) : undefined;
    const categories = csv(arg(categoriesArg));
    if (!bundle && categories.length === 0) continue;

    const discovered = await discoverRecipes(tree.recipesDir);
    let resolved;
    try {
      resolved = resolveRecipes(discovered, { bundle, categories }, { externallySatisfiedIds: satisfiedSoFar });
    } catch (err) {
      if (err instanceof RecipeResolutionError) {
        console.error(`Invalid selection for ${tree.label}: ${err.message}`);
        process.exit(1);
      }
      throw err;
    }
    for (const recipe of resolved) {
      for (const shared of recipe.sharedDirs) {
        layers.push({ label: `${tree.label}/${recipe.manifest.id} (shared)`, dir: shared.filesDir });
      }
      layers.push({ label: `${tree.label}/${recipe.manifest.id}`, dir: recipe.filesDir });
    }
    satisfiedSoFar = new Set([...satisfiedSoFar, ...resolved.map((r) => r.manifest.id)]);
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
