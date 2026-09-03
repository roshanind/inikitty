import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { discoverRecipes } from '../../src/engine/discover.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const recipesDir = path.join(fixturesDir, 'recipes');

describe('discoverRecipes', () => {
  it('returns an empty array when the recipes directory does not exist', async () => {
    const result = await discoverRecipes(path.join(fixturesDir, 'does-not-exist'));
    expect(result).toEqual([]);
  });

  it('discovers all fixture recipes with resolved paths', async () => {
    const result = await discoverRecipes(recipesDir);
    const ids = result.map((r) => r.manifest.id).sort();
    expect(ids).toEqual([
      'alpha',
      'collides-with-alpha',
      'conflicting',
      'needs-alpha',
      'needs-widgets',
      'widgets',
    ]);

    const alpha = result.find((r) => r.manifest.id === 'alpha');
    expect(alpha?.manifest.category).toBe('bundle');
    expect(alpha?.postInstallPath).toBeDefined();

    const widgets = result.find((r) => r.manifest.id === 'widgets');
    expect(widgets?.postInstallPath).toBeUndefined();
  });

  it('throws when a manifest id does not match its folder name', async () => {
    // reuse the real recipes dir structure but point discovery at a mismatched fixture
    const mismatchDir = path.join(fixturesDir, 'mismatched-recipes');
    await expect(discoverRecipes(mismatchDir)).rejects.toThrow();
  });
});
