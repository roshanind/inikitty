import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { discoverRecipes } from '../../src/engine/discover.js';
import { applyInjections, stripMarkers } from '../../src/engine/inject.js';
import type { DiscoveredRecipe } from '../../src/engine/types.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const baseDir = path.join(fixturesDir, 'base');
const recipesDir = path.join(fixturesDir, 'recipes');

let alpha: DiscoveredRecipe;
let tmpDirs: string[] = [];

beforeAll(async () => {
  const discovered = await discoverRecipes(recipesDir);
  const found = discovered.find((r) => r.manifest.id === 'alpha');
  if (!found) throw new Error('alpha fixture recipe not found');
  alpha = found;
});

afterEach(async () => {
  await Promise.all(tmpDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tmpDirs = [];
});

async function makeOutputDirFromBase(): Promise<string> {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'inikitty-inject-'));
  tmpDirs.push(outputDir);
  await fs.cp(baseDir, outputDir, { recursive: true });
  return outputDir;
}

describe('applyInjections', () => {
  it('inserts a snippet directly above its marker line', async () => {
    const outputDir = await makeOutputDirFromBase();
    await applyInjections(alpha, outputDir);

    const content = await fs.readFile(path.join(outputDir, 'api', 'src', 'app.module.ts'), 'utf8');
    expect(content).toContain("import { AlphaModule } from './alpha.module';");
    expect(content).toContain('AlphaProvider,');

    const importLine = content.indexOf("import { AlphaModule }");
    const markerLine = content.indexOf('@inikitty:inject:imports');
    expect(importLine).toBeGreaterThan(-1);
    expect(markerLine).toBeGreaterThan(importLine);
  });

  it('throws when a recipe targets a marker that does not exist', async () => {
    const outputDir = await makeOutputDirFromBase();
    const brokenRecipe: DiscoveredRecipe = {
      ...alpha,
      injectDir: path.join(fixturesDir, 'recipes', 'bundle', 'alpha', 'inject'),
      manifest: { ...alpha.manifest, id: 'alpha' },
    };
    // Corrupt the target file so the marker is missing.
    const targetPath = path.join(outputDir, 'api', 'src', 'app.module.ts');
    await fs.writeFile(targetPath, 'no markers here', 'utf8');

    await expect(applyInjections(brokenRecipe, outputDir)).rejects.toThrow(/no line containing/);
  });
});

describe('stripMarkers', () => {
  it('removes every remaining marker comment line', async () => {
    const outputDir = await makeOutputDirFromBase();
    await applyInjections(alpha, outputDir);
    await stripMarkers(outputDir);

    const content = await fs.readFile(path.join(outputDir, 'api', 'src', 'app.module.ts'), 'utf8');
    expect(content).not.toContain('@inikitty:inject:');
    // Untouched markers (module-imports, providers had a snippet but imports marker line itself
    // should also be gone; providers snippet content should remain).
    expect(content).toContain('AlphaProvider,');
  });
});
