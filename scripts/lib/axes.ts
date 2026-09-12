import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathExists } from '../../src/engine/fsUtils.js';

export interface AxisTree {
  /** e.g. "backends/nestjs" or "frontends/react-vite" — for logging/labeling only. */
  label: string;
  recipesDir: string;
  baseTemplateDir: string;
}

/**
 * Lists every real implementation under `repoRoot/<kind>/` (backends or frontends) — a folder
 * counts only if it has its own `base/`, which is what distinguishes a real implementation from a
 * sharedDirs fragment like `backends/shared/` (referenced via a recipe's `sharedDirs`, never
 * itself a `recipesDir`/`baseTemplateDir` pair). Mirrors `src/cli.ts`'s `listImplementations`.
 */
export async function listAxisTrees(repoRoot: string, kind: 'backends' | 'frontends'): Promise<AxisTree[]> {
  const kindDir = path.join(repoRoot, kind);
  if (!(await pathExists(kindDir))) return [];

  const entries = await fs.readdir(kindDir, { withFileTypes: true });
  const trees: AxisTree[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const baseTemplateDir = path.join(kindDir, entry.name, 'base');
    if (!(await pathExists(baseTemplateDir))) continue;
    trees.push({
      label: `${kind}/${entry.name}`,
      recipesDir: path.join(kindDir, entry.name, 'recipes'),
      baseTemplateDir,
    });
  }
  return trees;
}

/** Both axes' real implementation trees, combined — the default scope for tools that check or
 * report on every recipe that ships, regardless of which axis it belongs to. */
export async function listAllAxisTrees(repoRoot: string): Promise<AxisTree[]> {
  const [backends, frontends] = await Promise.all([
    listAxisTrees(repoRoot, 'backends'),
    listAxisTrees(repoRoot, 'frontends'),
  ]);
  return [...backends, ...frontends];
}

/** Resolves one named (or auto-detected, if there's only one) implementation for an axis —
 * shared by every script that takes an optional `--backend`/`--frontend <id>` flag. */
export async function resolveAxisTree(
  repoRoot: string,
  kind: 'backends' | 'frontends',
  requestedId: string | undefined,
): Promise<AxisTree> {
  const singular = kind.slice(0, -1);
  const trees = await listAxisTrees(repoRoot, kind);
  if (requestedId) {
    const found = trees.find((t) => t.label === `${kind}/${requestedId}`);
    if (!found) {
      throw new Error(`Unknown ${singular}: "${requestedId}" (available: ${trees.map((t) => t.label).join(', ')}).`);
    }
    return found;
  }
  if (trees.length === 1) {
    const only = trees[0];
    if (only) return only;
  }
  throw new Error(
    `Pass --${singular} <id> — ${trees.length === 0 ? 'no' : 'more than one'} ${singular} ${trees.length === 0 ? 'exists' : `exists (${trees.map((t) => t.label).join(', ')})`}.`,
  );
}
