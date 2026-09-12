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

  it('accepts a requiresAnyOf relationship satisfied by whichever bundle is selected', () => {
    expect(() =>
      resolveRecipes(discovered, { bundle: 'alpha', categories: ['needs-alpha-or-beta'] }),
    ).not.toThrow();

    expect(() =>
      resolveRecipes(discovered, { bundle: 'beta', categories: ['needs-alpha-or-beta'] }),
    ).not.toThrow();
  });

  it('rejects a requiresAnyOf relationship satisfied by neither alternative', () => {
    expect(() =>
      resolveRecipes(discovered, { bundle: 'gamma', categories: ['needs-alpha-or-beta'] }),
    ).toThrow(/requires one of/i);
  });

  describe('externallySatisfiedIds', () => {
    it('satisfies a requires relationship without the id being part of this resolution', () => {
      // needs-alpha requires 'alpha', but this resolution selects the 'beta' bundle instead —
      // without externallySatisfiedIds this must fail, exactly like the plain requires test above.
      expect(() => resolveRecipes(discovered, { bundle: 'beta', categories: ['needs-alpha'] })).toThrow(
        /requires/i,
      );

      expect(() =>
        resolveRecipes(
          discovered,
          { bundle: 'beta', categories: ['needs-alpha'] },
          { externallySatisfiedIds: new Set(['alpha']) },
        ),
      ).not.toThrow();
    });

    it('satisfies a requiresAnyOf relationship the same way', () => {
      expect(() =>
        resolveRecipes(
          discovered,
          { bundle: 'gamma', categories: ['needs-alpha-or-beta'] },
          { externallySatisfiedIds: new Set(['beta']) },
        ),
      ).not.toThrow();
    });

    it('is never consulted for conflicts — only requires/requiresAnyOf', () => {
      // 'conflicting' conflicts with 'widgets'; widgets is only externally satisfied here, never
      // actually selected in this resolution's own categories, so no conflict should fire.
      expect(() =>
        resolveRecipes(
          discovered,
          { bundle: 'alpha', categories: ['conflicting'] },
          { externallySatisfiedIds: new Set(['widgets']) },
        ),
      ).not.toThrow();
    });
  });
});
