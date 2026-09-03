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
import type { DiscoveredRecipe, GenerateOptions } from './types.js';

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

export interface GenerateResult {
  outputDir: string;
  appliedRecipes: DiscoveredRecipe[];
}

/**
 * Orchestrates a full generation: copy base template -> copy each recipe's files/ ->
 * apply each recipe's inject/ snippets -> strip leftover markers -> merge packageJsonPatch ->
 * merge envVars -> substitute {{projectName}} placeholders -> run postInstall scripts.
 */
export async function generate(options: GenerateOptions): Promise<GenerateResult> {
  const packageRoot = await findPackageRoot(path.dirname(fileURLToPath(import.meta.url)));
  const recipesDir = options.recipesDir ?? path.join(packageRoot, 'recipes');
  const baseTemplateDir = options.baseTemplateDir ?? path.join(packageRoot, 'templates', 'base');

  if (!(await pathExists(baseTemplateDir))) {
    throw new Error(`Base template directory not found: "${baseTemplateDir}".`);
  }
  if (await pathExists(options.outputDir)) {
    const existing = await fs.readdir(options.outputDir);
    if (existing.length > 0) {
      throw new Error(`Output directory "${options.outputDir}" already exists and is not empty.`);
    }
  }

  const discovered = await discoverRecipes(recipesDir);
  const resolved = resolveRecipes(discovered, options.selection);

  await fs.mkdir(options.outputDir, { recursive: true });
  await copyTree(baseTemplateDir, options.outputDir, { overwrite: false });

  for (const recipe of resolved) {
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
    await applyInjections(recipe, options.outputDir);
  }
  await mergeEnvVars(resolved, options.outputDir);
  await stripMarkers(options.outputDir);

  await mergePackageJsonPatches(resolved, options.outputDir);
  await substitutePlaceholders(options.outputDir, options.projectName);

  if (options.runPostInstall !== false) {
    await runPostInstalls(resolved, {
      outputDir: options.outputDir,
      projectName: options.projectName,
    });
  }

  return { outputDir: options.outputDir, appliedRecipes: resolved };
}
