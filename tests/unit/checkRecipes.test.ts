import { describe, expect, it } from 'vitest';
import {
  checkDanglingReferences,
  checkDependencyVersionMismatches,
  checkEnvVarKeyCollisions,
} from '../../scripts/lib/checkRecipes.js';
import type { DiscoveredRecipe, RecipeManifest } from '../../src/engine/types.js';

function makeRecipe(manifest: RecipeManifest): DiscoveredRecipe {
  return {
    manifest,
    dir: `/fake/${manifest.category}/${manifest.id}`,
    filesDir: `/fake/${manifest.category}/${manifest.id}/files`,
    injectDir: `/fake/${manifest.category}/${manifest.id}/inject`,
    sharedDirs: [],
    postInstallPath: undefined,
  };
}

describe('checkDanglingReferences', () => {
  it('finds no issues when every reference resolves to a discovered id', () => {
    const a = makeRecipe({ id: 'a', category: 'bundle' });
    const b = makeRecipe({ id: 'b', category: 'extra', requires: ['a'] });
    expect(checkDanglingReferences([a, b])).toEqual([]);
  });

  it('flags a requires/conflicts/requiresAnyOf entry that references an unknown id', () => {
    const a = makeRecipe({ id: 'a', category: 'extra', requires: ['ghost'] });
    const issues = checkDanglingReferences([a]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.level).toBe('error');
    expect(issues[0]?.message).toContain('"a"');
    expect(issues[0]?.message).toContain('"ghost"');
  });

  it('flags a recipe that lists itself', () => {
    const a = makeRecipe({ id: 'a', category: 'extra', conflicts: ['a'] });
    const issues = checkDanglingReferences([a]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('lists itself');
  });

  it('does not flag a reference satisfied by externallyKnownIds (a cross-axis reference)', () => {
    const a = makeRecipe({ id: 'a', category: 'pages', requiresAnyOf: ['backend-bundle'] });
    expect(checkDanglingReferences([a])).toHaveLength(1);
    expect(checkDanglingReferences([a], new Set(['backend-bundle']))).toEqual([]);
  });
});

describe('checkDependencyVersionMismatches', () => {
  it('flags two category recipes pinning the same package to different versions', () => {
    const a = makeRecipe({
      id: 'a',
      category: 'extra',
      packageJsonPatch: { api: { dependencies: { zod: '^3.0.0' } } },
    });
    const b = makeRecipe({
      id: 'b',
      category: 'extra',
      packageJsonPatch: { api: { dependencies: { zod: '^4.0.0' } } },
    });
    const issues = checkDependencyVersionMismatches([a, b]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.level).toBe('warn');
    expect(issues[0]?.message).toContain('zod');
  });

  it('does not flag two bundle recipes, since only one bundle is ever selected', () => {
    const a = makeRecipe({
      id: 'a',
      category: 'bundle',
      packageJsonPatch: { api: { dependencies: { zod: '^3.0.0' } } },
    });
    const b = makeRecipe({
      id: 'b',
      category: 'bundle',
      packageJsonPatch: { api: { dependencies: { zod: '^4.0.0' } } },
    });
    expect(checkDependencyVersionMismatches([a, b])).toEqual([]);
  });

  it('does not flag matching versions', () => {
    const a = makeRecipe({
      id: 'a',
      category: 'extra',
      packageJsonPatch: { api: { dependencies: { zod: '^4.0.0' } } },
    });
    const b = makeRecipe({
      id: 'b',
      category: 'extra',
      packageJsonPatch: { api: { dependencies: { zod: '^4.0.0' } } },
    });
    expect(checkDependencyVersionMismatches([a, b])).toEqual([]);
  });
});

describe('checkEnvVarKeyCollisions', () => {
  it('flags the same envVar key declared by two different category recipes', () => {
    const a = makeRecipe({
      id: 'a',
      category: 'extra',
      envVars: [{ key: 'FOO', example: '1' }],
    });
    const b = makeRecipe({
      id: 'b',
      category: 'extra',
      envVars: [{ key: 'FOO', example: '2' }],
    });
    const issues = checkEnvVarKeyCollisions([a, b]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('FOO');
  });

  it('does not flag two bundle recipes declaring the same key', () => {
    const a = makeRecipe({ id: 'a', category: 'bundle', envVars: [{ key: 'DATABASE_URL', example: '1' }] });
    const b = makeRecipe({ id: 'b', category: 'bundle', envVars: [{ key: 'DATABASE_URL', example: '2' }] });
    expect(checkEnvVarKeyCollisions([a, b])).toEqual([]);
  });
});
