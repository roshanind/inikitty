import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { discoverRecipes } from '../../src/engine/discover.js';
import { RecipeResolutionError, resolveRecipes } from '../../src/engine/resolve.js';
import type { DiscoveredRecipe } from '../../src/engine/types.js';

const recipesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'recipes');

let discovered: DiscoveredRecipe[];

beforeAll(async () => {
  discovered = await discoverRecipes(recipesDir);
});

describe('resolveRecipes', () => {
  it('orders the bundle first, then category recipes alphabetically', () => {
    const resolved = resolveRecipes(discovered, { bundle: 'alpha', categories: ['widgets'] });
    expect(resolved.map((r) => r.manifest.id)).toEqual(['alpha', 'widgets']);
  });

  it('requires a bundle to be selected when bundles are available', () => {
    expect(() => resolveRecipes(discovered, { categories: [] })).toThrow(RecipeResolutionError);
  });

  it('rejects an unknown bundle id', () => {
    expect(() => resolveRecipes(discovered, { bundle: 'nope', categories: [] })).toThrow(
      RecipeResolutionError,
    );
  });

  it('rejects a category recipe id that is actually a bundle', () => {
    expect(() => resolveRecipes(discovered, { bundle: 'alpha', categories: ['alpha'] })).toThrow(
      RecipeResolutionError,
    );
  });

  it('accepts a requires relationship satisfied by the selected bundle', () => {
    expect(() =>
      resolveRecipes(discovered, { bundle: 'alpha', categories: ['needs-alpha'] }),
    ).not.toThrow();
  });

  it('rejects a category selection with an unmet requires on another category', () => {
    expect(() =>
      resolveRecipes(discovered, { bundle: 'alpha', categories: ['widgets', 'needs-widgets'] }),
    ).not.toThrow();

    expect(() =>
      resolveRecipes(discovered, { bundle: 'alpha', categories: ['needs-widgets'] }),
    ).toThrow(/requires/i);
  });

  it('rejects conflicting selections in either direction', () => {
    expect(() =>
      resolveRecipes(discovered, { bundle: 'alpha', categories: ['widgets', 'conflicting'] }),
    ).toThrow(/conflicts/i);
  });
});
