import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { discoverRecipes } from '../../src/engine/discover.js';
import { mergePackageJsonPatches } from '../../src/engine/packageJson.js';
import type { DiscoveredRecipe } from '../../src/engine/types.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const baseDir = path.join(fixturesDir, 'base');
const recipesDir = path.join(fixturesDir, 'recipes');

let alpha: DiscoveredRecipe;
let widgets: DiscoveredRecipe;
let tmpDirs: string[] = [];

beforeAll(async () => {
  const discovered = await discoverRecipes(recipesDir);
  alpha = discovered.find((r) => r.manifest.id === 'alpha')!;
  widgets = discovered.find((r) => r.manifest.id === 'widgets')!;
});

afterEach(async () => {
  await Promise.all(tmpDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tmpDirs = [];
});

async function makeOutputDirFromBase(): Promise<string> {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'inikitty-pkg-'));
  tmpDirs.push(outputDir);
  await fs.cp(baseDir, outputDir, { recursive: true });
  return outputDir;
}

describe('mergePackageJsonPatches', () => {
  it('merges dependencies from multiple recipes into the right target package.json', async () => {
    const outputDir = await makeOutputDirFromBase();
    await mergePackageJsonPatches([alpha, widgets], outputDir);

    const apiPkg = JSON.parse(await fs.readFile(path.join(outputDir, 'api', 'package.json'), 'utf8'));
    expect(apiPkg.dependencies['alpha-lib']).toBe('^1.0.0');
    expect(apiPkg.dependencies['widgets-lib']).toBeUndefined();

    const appPkg = JSON.parse(await fs.readFile(path.join(outputDir, 'app', 'package.json'), 'utf8'));
    expect(appPkg.dependencies['widgets-lib']).toBe('^2.0.0');
    expect(appPkg.dependencies['alpha-lib']).toBeUndefined();
  });

  it('lets a later recipe override an earlier one for the same dependency key, with a warning', async () => {
    const outputDir = await makeOutputDirFromBase();
    const overrideRecipe: DiscoveredRecipe = {
      ...alpha,
      manifest: {
        ...alpha.manifest,
        id: 'alpha',
        packageJsonPatch: { api: { dependencies: { 'alpha-lib': '^2.0.0' } } },
      },
    };
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await mergePackageJsonPatches([alpha, overrideRecipe], outputDir);

    const apiPkg = JSON.parse(await fs.readFile(path.join(outputDir, 'api', 'package.json'), 'utf8'));
    expect(apiPkg.dependencies['alpha-lib']).toBe('^2.0.0');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
