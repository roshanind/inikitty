import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathExists } from './fsUtils.js';
import type { DiscoveredRecipe, PackageJsonPatchFragment } from './types.js';

type PackageJsonTarget = 'api' | 'app';

function mergeRecord(
  existing: Record<string, string>,
  patch: Record<string, string>,
  recipeId: string,
  target: PackageJsonTarget,
  fieldLabel: string,
): void {
  for (const [key, value] of Object.entries(patch)) {
    if (existing[key] !== undefined && existing[key] !== value) {
      console.warn(
        `[create-inikitty] "${recipeId}" overrides ${target}/package.json ${fieldLabel}."${key}": ` +
          `"${existing[key]}" -> "${value}"`,
      );
    }
    existing[key] = value;
  }
}

function mergeFragment(
  base: Record<string, unknown>,
  fragment: PackageJsonPatchFragment,
  recipeId: string,
  target: PackageJsonTarget,
): void {
  for (const field of ['dependencies', 'devDependencies', 'scripts'] as const) {
    const patch = fragment[field];
    if (!patch) continue;
    const existing = (base[field] as Record<string, string> | undefined) ?? {};
    mergeRecord(existing, patch, recipeId, target, field);
    base[field] = existing;
  }

  if (fragment.jestModuleNameMapper) {
    const jestConfig = (base.jest as Record<string, unknown> | undefined) ?? {};
    const existingMapper = (jestConfig.moduleNameMapper as Record<string, string> | undefined) ?? {};
    mergeRecord(existingMapper, fragment.jestModuleNameMapper, recipeId, target, 'jest.moduleNameMapper');
    jestConfig.moduleNameMapper = existingMapper;
    base.jest = jestConfig;
  }
}

/** Merges each resolved recipe's packageJsonPatch into api/package.json and app/package.json, in order. */
export async function mergePackageJsonPatches(
  recipes: DiscoveredRecipe[],
  outputDir: string,
): Promise<void> {
  for (const target of ['api', 'app'] as const) {
    const pkgPath = path.join(outputDir, target, 'package.json');
    if (!(await pathExists(pkgPath))) continue;

    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8')) as Record<string, unknown>;
    for (const recipe of recipes) {
      const fragment = recipe.manifest.packageJsonPatch?.[target];
      if (fragment) mergeFragment(pkg, fragment, recipe.manifest.id, target);
    }
    await fs.writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  }
}
