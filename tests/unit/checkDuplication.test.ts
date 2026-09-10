import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findDuplicateFiles } from '../../scripts/lib/checkDuplication.js';
import type { DiscoveredRecipe, RecipeManifest } from '../../src/engine/types.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'duplication');

function makeRecipe(id: string, manifest: Partial<RecipeManifest> = {}): DiscoveredRecipe {
  const dir = path.join(fixturesDir, id);
  return {
    manifest: { id, category: 'extra', ...manifest },
    dir,
    filesDir: path.join(dir, 'files'),
    injectDir: path.join(dir, 'inject'),
    sharedDirs: [],
    postInstallPath: undefined,
  };
}

describe('findDuplicateFiles', () => {
  it('flags a byte-identical file at the same relative path across two recipes', async () => {
    const a = makeRecipe('recipe-a');
    const b = makeRecipe('recipe-b');

    const findings = await findDuplicateFiles([a, b]);

    expect(findings).toEqual([
      { recipeAId: 'recipe-a', recipeBId: 'recipe-b', relativePath: path.join('files', 'api', 'shared.ts') },
    ]);
  });

  it('does not flag files that only exist under one recipe', async () => {
    const a = makeRecipe('recipe-a');
    const b = makeRecipe('recipe-b');

    const findings = await findDuplicateFiles([a, b]);
    const paths = findings.map((f) => f.relativePath);

    expect(paths).not.toContain(path.join('files', 'api', 'only-a.ts'));
    expect(paths).not.toContain(path.join('files', 'api', 'only-b.ts'));
  });

  it('returns nothing for a single recipe (no pair to compare)', async () => {
    const a = makeRecipe('recipe-a');
    expect(await findDuplicateFiles([a])).toEqual([]);
  });
});
