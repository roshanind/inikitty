import { BUNDLE_CATEGORY } from '../../src/engine/types.js';
import type { DiscoveredRecipe } from '../../src/engine/types.js';

export interface CheckIssue {
  level: 'error' | 'warn';
  message: string;
}

/** Two different bundle recipes can never be selected together — exactly one bundle is always
 * chosen, by construction, regardless of `conflicts`. A collision between two bundles' own
 * envVars/dependencies is therefore never actually reachable and shouldn't be flagged as one. */
function bothBundles(a: DiscoveredRecipe, b: DiscoveredRecipe): boolean {
  return a.manifest.category === BUNDLE_CATEGORY && b.manifest.category === BUNDLE_CATEGORY;
}

/**
 * Flags `conflicts`/`requires`/`requiresAnyOf` entries that reference an id no discovered recipe
 * has, or reference the recipe's own id. `sharedDirs` needs no equivalent check here —
 * `discoverRecipes()` already throws at discovery time if an entry doesn't exist on disk.
 */
export function checkDanglingReferences(discovered: DiscoveredRecipe[]): CheckIssue[] {
  const ids = new Set(discovered.map((r) => r.manifest.id));
  const issues: CheckIssue[] = [];

  for (const recipe of discovered) {
    const { id } = recipe.manifest;
    const fields: Array<['conflicts' | 'requires' | 'requiresAnyOf', string[]]> = [
      ['conflicts', recipe.manifest.conflicts ?? []],
      ['requires', recipe.manifest.requires ?? []],
      ['requiresAnyOf', recipe.manifest.requiresAnyOf ?? []],
    ];
    for (const [field, list] of fields) {
      for (const ref of list) {
        if (ref === id) {
          issues.push({ level: 'error', message: `"${id}" lists itself in ${field}.` });
        } else if (!ids.has(ref)) {
          issues.push({
            level: 'error',
            message: `"${id}"'s ${field} references unknown recipe id "${ref}".`,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Flags a package name pinned to two different version strings by two different recipes' own
 * `packageJsonPatch`. Not necessarily wrong (two bundles are never selected together, so their
 * pins never actually collide) — but two *category* recipes that both add the same dependency at
 * different versions would silently overwrite each other (`mergePackageJsonPatches` warns at
 * generate() time, but only if someone happens to select both), so surfacing it up front is worth
 * a look even when it turns out to be fine.
 */
export function checkDependencyVersionMismatches(discovered: DiscoveredRecipe[]): CheckIssue[] {
  const issues: CheckIssue[] = [];

  for (const target of ['api', 'app'] as const) {
    for (const field of ['dependencies', 'devDependencies'] as const) {
      const seen = new Map<string, { recipe: DiscoveredRecipe; version: string }>();
      for (const recipe of discovered) {
        const patch = recipe.manifest.packageJsonPatch?.[target]?.[field];
        if (!patch) continue;
        for (const [pkg, version] of Object.entries(patch)) {
          const prior = seen.get(pkg);
          if (prior && prior.version !== version && !bothBundles(prior.recipe, recipe)) {
            issues.push({
              level: 'warn',
              message:
                `${target}/package.json ${field}."${pkg}": "${prior.recipe.manifest.id}" wants ` +
                `"${prior.version}", "${recipe.manifest.id}" wants "${version}" — only safe if these ` +
                'two recipes are never selected together.',
            });
          }
          seen.set(pkg, { recipe, version });
        }
      }
    }
  }

  return issues;
}

/**
 * Flags an envVar key declared by more than one recipe. `mergeEnvVars` keeps whichever recipe
 * applies last with no warning — usually fine (a category recipe overriding a bundle's default is
 * often intentional), but worth a human glance the first time it happens.
 */
export function checkEnvVarKeyCollisions(discovered: DiscoveredRecipe[]): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const seen = new Map<string, DiscoveredRecipe>();

  for (const recipe of discovered) {
    for (const envVar of recipe.manifest.envVars ?? []) {
      const prior = seen.get(envVar.key);
      if (prior && prior.manifest.id !== recipe.manifest.id && !bothBundles(prior, recipe)) {
        issues.push({
          level: 'warn',
          message:
            `envVar "${envVar.key}" is declared by both "${prior.manifest.id}" and ` +
            `"${recipe.manifest.id}" — whichever resolves last silently wins.`,
        });
      }
      seen.set(envVar.key, recipe);
    }
  }

  return issues;
}

export function checkAll(discovered: DiscoveredRecipe[]): CheckIssue[] {
  return [
    ...checkDanglingReferences(discovered),
    ...checkDependencyVersionMismatches(discovered),
    ...checkEnvVarKeyCollisions(discovered),
  ];
}
