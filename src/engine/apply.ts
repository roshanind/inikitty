import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverRecipes } from './discover.js';
import { mergeEnvVars } from './envVars.js';
import { copyTree, findPackageRoot, isTextFile, listFilesRecursive, pathExists } from './fsUtils.js';
import { applyInjections, stripMarkers } from './inject.js';
import { mergePackageJsonPatches } from './packageJson.js';
import { runPostInstalls } from './postInstall.js';
import { resolveRecipes } from './resolve.js';
import type { DiscoveredRecipe, GenerateOptions, RecipeSelection } from './types.js';

function toKebabCase(name: string): string {
  return name
    .trim()
    .replace(/[_\s]+/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function substitutePlaceholders(outputDir: string, projectName: string): Promise<void> {
  const replacements: Record<string, string> = {
    '{{projectName}}': projectName,
    '{{projectNameKebab}}': toKebabCase(projectName),
  };
  const files = (await listFilesRecursive(outputDir)).filter(isTextFile);
  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf8');
    if (!content.includes('{{')) continue;
    let replaced = content;
    for (const [token, value] of Object.entries(replacements)) {
      replaced = replaced.split(token).join(value);
    }
    await fs.writeFile(filePath, replaced, 'utf8');
  }
}

async function checkOutputDirEmpty(outputDir: string): Promise<void> {
  if (await pathExists(outputDir)) {
    const existing = await fs.readdir(outputDir);
    if (existing.length > 0) {
      throw new Error(`Output directory "${outputDir}" already exists and is not empty.`);
    }
  }
}

export interface GenerateResult {
  outputDir: string;
  appliedRecipes: DiscoveredRecipe[];
}

export interface ApplyRecipesToOutputOptions {
  outputDir: string;
  recipesDir: string;
  baseTemplateDir: string;
  selection: RecipeSelection;
  /** Passed straight through to `resolveRecipes` — recipe ids resolved by another axis in a
   * multi-axis generation (see `generateMultiAxis`). Omit for a single-axis generation. */
  externallySatisfiedIds?: Set<string>;
}

/**
 * Discovers and resolves `recipesDir` against `selection`, then copies `baseTemplateDir` and
 * every resolved recipe's `files/`/`sharedDirs` into `outputDir` and applies their `inject/`
 * snippets. Assumes `outputDir` already exists — callers own its lifecycle (creation, the
 * "already exists and not empty" guard) since a multi-axis generation calls this more than once
 * against the same directory. Deliberately stops short of `finalizeOutput`'s steps (envVars,
 * markers, packageJsonPatch, placeholders) — those must run exactly once, after every axis has
 * contributed its files/injects, not once per axis.
 */
export async function applyRecipesToOutput(
  options: ApplyRecipesToOutputOptions,
): Promise<DiscoveredRecipe[]> {
  if (!(await pathExists(options.baseTemplateDir))) {
    throw new Error(`Base template directory not found: "${options.baseTemplateDir}".`);
  }

  const discovered = await discoverRecipes(options.recipesDir);
  const resolved = resolveRecipes(discovered, options.selection, {
    externallySatisfiedIds: options.externallySatisfiedIds,
  });

  await copyTree(options.baseTemplateDir, options.outputDir, { overwrite: false });

  for (const recipe of resolved) {
    for (const shared of recipe.sharedDirs) {
      if (await pathExists(shared.filesDir)) {
        await copyTree(shared.filesDir, options.outputDir, {
          overwrite: false,
          onCollision: (relPath) => {
            throw new Error(
              `Recipe "${recipe.manifest.id}"'s shared files (via sharedDirs) tried to write ` +
                `"${relPath}", which was already written by the base template or an earlier recipe.`,
            );
          },
        });
      }
    }
    if (await pathExists(recipe.filesDir)) {
      await copyTree(recipe.filesDir, options.outputDir, {
        overwrite: false,
        onCollision: (relPath) => {
          throw new Error(
            `Recipe "${recipe.manifest.id}" tried to write "${relPath}", which was already ` +
              `written by the base template or an earlier recipe.`,
          );
        },
      });
    }
  }

  for (const recipe of resolved) {
    for (const shared of recipe.sharedDirs) {
      await applyInjections({ ...recipe, injectDir: shared.injectDir }, options.outputDir);
    }
    await applyInjections(recipe, options.outputDir);
  }

  return resolved;
}

export interface FinalizeOutputOptions {
  outputDir: string;
  projectName: string;
  /** Every recipe applied across every axis, combined — envVars/packageJsonPatch merge over all
   * of them together, and markers are stripped once only after all of them have injected. */
  recipes: DiscoveredRecipe[];
}

/** Runs the steps that must happen exactly once, after all recipes (across every axis, in a
 * multi-axis generation) have copied their files and applied their injections. */
export async function finalizeOutput(options: FinalizeOutputOptions): Promise<void> {
  await mergeEnvVars(options.recipes, options.outputDir);
  await stripMarkers(options.outputDir);
  await mergePackageJsonPatches(options.recipes, options.outputDir);
  await substitutePlaceholders(options.outputDir, options.projectName);
}

/**
 * Orchestrates a full single-axis generation: copy base template -> copy each recipe's files/ ->
 * apply each recipe's inject/ snippets -> strip leftover markers -> merge packageJsonPatch ->
 * merge envVars -> substitute {{projectName}} placeholders -> run postInstall scripts.
 */
export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const packageRoot = await findPackageRoot(path.dirname(fileURLToPath(import.meta.url)));
  const recipesDir = options.recipesDir ?? path.join(packageRoot, 'recipes');
  const baseTemplateDir = options.baseTemplateDir ?? path.join(packageRoot, 'templates', 'base');

  await checkOutputDirEmpty(options.outputDir);
  await fs.mkdir(options.outputDir, { recursive: true });

  const resolved = await applyRecipesToOutput({
    outputDir: options.outputDir,
    recipesDir,
    baseTemplateDir,
    selection: options.selection,
  });

  await finalizeOutput({
    outputDir: options.outputDir,
    projectName: options.projectName,
    recipes: resolved,
  });

  if (options.runPostInstall !== false) {
    await runPostInstalls(resolved, {
      outputDir: options.outputDir,
      projectName: options.projectName,
    });
  }

  return { outputDir: options.outputDir, appliedRecipes: resolved };
}

export interface AxisOptions {
  recipesDir: string;
  baseTemplateDir: string;
  selection: RecipeSelection;
}

export interface GenerateMultiAxisOptions {
  /** Directory of root-level, axis-agnostic files (AGENTS.md, README.md, .env.example,
   * .gitignore) copied once before any axis runs. Defaults to the package's own templates/root. */
  rootTemplateDir?: string;
  /** Applied in order. Each axis after the first receives every prior axis's resolved recipe ids
   * as `externallySatisfiedIds`, so e.g. a frontend axis's `requiresAnyOf` can reference a
   * backend axis's bundle id. */
  axes: AxisOptions[];
  outputDir: string;
  projectName: string;
  runPostInstall?: boolean;
}

export interface GenerateMultiAxisResult {
  outputDir: string;
  /** Every axis's resolved recipes, concatenated in axis order. */
  appliedRecipes: DiscoveredRecipe[];
}

/**
 * Orchestrates a generation spanning more than one independent axis (e.g. a backend choice and a
 * frontend choice) — each with its own `recipesDir`/`baseTemplateDir`/`selection`, resolved via
 * separate `discoverRecipes()` calls, writing into the same output directory. See
 * `docs/product-scope-phase-2.md` for why this exists as a second, additive function rather than
 * a `generate()` rewrite: every single-axis caller (tests, scripts, `generate()` itself) is
 * unaffected.
 */
export async function generateMultiAxis(
  options: GenerateMultiAxisOptions,
): Promise<GenerateMultiAxisResult> {
  const packageRoot = await findPackageRoot(path.dirname(fileURLToPath(import.meta.url)));
  const rootTemplateDir = options.rootTemplateDir ?? path.join(packageRoot, 'templates', 'root');

  if (!(await pathExists(rootTemplateDir))) {
    throw new Error(`Root template directory not found: "${rootTemplateDir}".`);
  }

  await checkOutputDirEmpty(options.outputDir);
  await fs.mkdir(options.outputDir, { recursive: true });
  await copyTree(rootTemplateDir, options.outputDir, { overwrite: false });

  const appliedRecipes: DiscoveredRecipe[] = [];
  const satisfiedSoFar = new Set<string>();
  for (const axis of options.axes) {
    const resolved = await applyRecipesToOutput({
      outputDir: options.outputDir,
      recipesDir: axis.recipesDir,
      baseTemplateDir: axis.baseTemplateDir,
      selection: axis.selection,
      externallySatisfiedIds: new Set(satisfiedSoFar),
    });
    for (const recipe of resolved) satisfiedSoFar.add(recipe.manifest.id);
    appliedRecipes.push(...resolved);
  }

  await finalizeOutput({
    outputDir: options.outputDir,
    projectName: options.projectName,
    recipes: appliedRecipes,
  });

  if (options.runPostInstall !== false) {
    await runPostInstalls(appliedRecipes, {
      outputDir: options.outputDir,
      projectName: options.projectName,
    });
  }

  return { outputDir: options.outputDir, appliedRecipes };
}
