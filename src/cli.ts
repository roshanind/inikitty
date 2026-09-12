#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { copyFile } from 'node:fs/promises';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as p from '@clack/prompts';
import { generateMultiAxis } from './engine/apply.js';
import { discoverRecipes } from './engine/discover.js';
import { findPackageRoot, pathExists } from './engine/fsUtils.js';
import { runPostInstalls } from './engine/postInstall.js';
import { BUNDLE_CATEGORY } from './engine/types.js';
import type { RecipeSelection } from './engine/types.js';
import type { AxisOptions, GenerateMultiAxisResult } from './engine/apply.js';

function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

/** Lists real implementation folders under `rootDir/<kind>/` — a folder counts only if it has its
 * own `base/` (this is what distinguishes e.g. `backends/nestjs/` from `backends/shared/`, a
 * fragment referenced via `sharedDirs` rather than a selectable implementation). */
async function listImplementations(rootDir: string): Promise<string[]> {
  if (!(await pathExists(rootDir))) return [];
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (await pathExists(path.join(rootDir, entry.name, 'base'))) {
      names.push(entry.name);
    }
  }
  return names.sort();
}

/** Prompts to pick one implementation id from `options`, skipping the prompt entirely when
 * there's only one — matching the existing "no prompt if there's nothing to choose" pattern
 * already used for the bundle/category prompts below. */
async function pickImplementation(message: string, options: string[]): Promise<string> {
  if (options.length === 1) {
    const only = options[0];
    if (only === undefined) throw new Error('Unreachable: options.length === 1 but options[0] is undefined.');
    return only;
  }
  const choice = await p.select({
    message,
    options: options.map((name) => ({ value: name, label: name })),
  });
  if (p.isCancel(choice)) {
    p.cancel('Cancelled.');
    process.exit(1);
  }
  return choice;
}

interface AxisSelection {
  recipesDir: string;
  baseTemplateDir: string;
  selection: RecipeSelection;
}

/** Prompts for a bundle (if any bundle-category recipes exist) and categories (if any others
 * exist) within one implementation's own recipe tree — identical logic to what the single-axis
 * CLI used to do directly, now reusable per axis. Cross-axis `requiresAnyOf` validation (e.g. a
 * frontend category requiring a backend bundle) happens later, inside `generateMultiAxis` itself;
 * prompting here doesn't validate anything up front, matching how the single-axis CLI never did
 * either — an invalid combination surfaces as a clear error from generation, not a silent prompt
 * restriction. */
async function promptAxisSelection(
  axisLabel: string,
  recipesDir: string,
  baseTemplateDir: string,
): Promise<AxisSelection> {
  const discovered = await discoverRecipes(recipesDir);
  const bundles = discovered.filter((r) => r.manifest.category === BUNDLE_CATEGORY);
  const categoryRecipes = discovered.filter((r) => r.manifest.category !== BUNDLE_CATEGORY);

  let bundle: string | undefined;
  if (bundles.length > 0) {
    const choice = await p.select({
      message: `Pick a ${axisLabel} bundle`,
      options: bundles.map((r) => ({
        value: r.manifest.id,
        label: r.manifest.label ?? r.manifest.id,
        hint: r.manifest.description,
      })),
    });
    if (p.isCancel(choice)) {
      p.cancel('Cancelled.');
      process.exit(1);
    }
    bundle = choice;
  }

  let categories: string[] = [];
  if (categoryRecipes.length > 0) {
    const choice = await p.multiselect({
      message: `${axisLabel} — additional options`,
      options: categoryRecipes.map((r) => ({
        value: r.manifest.id,
        label: r.manifest.label ?? r.manifest.id,
        hint: r.manifest.description,
      })),
      required: false,
    });
    if (p.isCancel(choice)) {
      p.cancel('Cancelled.');
      process.exit(1);
    }
    categories = choice;
  }

  return { recipesDir, baseTemplateDir, selection: { bundle, categories } };
}

async function main() {
  p.intro('create-inikitty');

  const projectName = await p.text({
    message: 'Project name',
    placeholder: 'my-saas-app',
    validate: (value) => {
      if (!value.trim()) return 'Project name is required.';
      if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
        return 'Use only letters, numbers, dots, dashes, and underscores.';
      }
      return undefined;
    },
  });
  if (p.isCancel(projectName)) {
    p.cancel('Cancelled.');
    process.exit(1);
  }

  const packageRoot = await findPackageRoot(path.dirname(fileURLToPath(import.meta.url)));

  const backendNames = await listImplementations(path.join(packageRoot, 'backends'));
  if (backendNames.length === 0) {
    p.cancel('No backend implementation is available — nothing to generate.');
    process.exit(1);
  }
  const backendName = await pickImplementation('Pick a backend', backendNames);
  const backendAxis = await promptAxisSelection(
    'Backend',
    path.join(packageRoot, 'backends', backendName, 'recipes'),
    path.join(packageRoot, 'backends', backendName, 'base'),
  );

  const frontendNames = await listImplementations(path.join(packageRoot, 'frontends'));
  if (frontendNames.length === 0) {
    p.cancel('No frontend implementation is available — nothing to generate.');
    process.exit(1);
  }
  const frontendName = await pickImplementation('Pick a frontend', frontendNames);
  const frontendAxis = await promptAxisSelection(
    'Frontend',
    path.join(packageRoot, 'frontends', frontendName, 'recipes'),
    path.join(packageRoot, 'frontends', frontendName, 'base'),
  );

  const outputDir = path.resolve(process.cwd(), projectName);
  const axes: AxisOptions[] = [
    { recipesDir: backendAxis.recipesDir, baseTemplateDir: backendAxis.baseTemplateDir, selection: backendAxis.selection },
    { recipesDir: frontendAxis.recipesDir, baseTemplateDir: frontendAxis.baseTemplateDir, selection: frontendAxis.selection },
  ];

  const spinner = p.spinner();
  spinner.start('Generating project files');
  let result: GenerateMultiAxisResult;
  try {
    result = await generateMultiAxis({
      outputDir,
      projectName,
      axes,
      // postInstall scripts (e.g. `prisma migrate`) need installed deps to run against, so they
      // run after `pnpm install` below, not as part of generateMultiAxis() itself.
      runPostInstall: false,
    });
    spinner.stop('Project files generated.');
  } catch (err) {
    spinner.stop('Generation failed.');
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // A recipe's envVars land in .env.example only (see mergeEnvVars) — copy its working local-dev
  // defaults into api/.env now, before postInstall runs below, so `dotenv/config` (in auth.ts,
  // prisma.config.ts/drizzle.config.ts, etc.) can actually find DATABASE_URL and friends. Without
  // this, every postInstall step silently fails with a "Cannot resolve environment variable" error
  // and the run falls back to printing manual steps — a real bug this exact line fixes.
  const envExample = path.join(outputDir, '.env.example');
  if (await pathExists(envExample)) {
    await copyFile(envExample, path.join(outputDir, 'api', '.env'));
  }

  // A recipe (e.g. the golden-path bundle, for its packages/shared) may have written a root
  // pnpm-workspace.yaml — install once at the root then, so workspace:* deps link correctly,
  // rather than two isolated installs that can't see each other's packages.
  const isWorkspace = await pathExists(path.join(outputDir, 'pnpm-workspace.yaml'));
  const installSpinner = p.spinner();
  installSpinner.start(
    isWorkspace ? 'Installing dependencies (pnpm install)' : 'Installing dependencies (pnpm install in api/ and app/)',
  );
  let installed = false;
  try {
    if (isWorkspace) {
      await runCommand('pnpm', ['install'], outputDir);
    } else {
      await runCommand('pnpm', ['install'], path.join(outputDir, 'api'));
      await runCommand('pnpm', ['install'], path.join(outputDir, 'app'));
    }
    installSpinner.stop('Dependencies installed.');
    installed = true;
  } catch (err) {
    installSpinner.stop('Dependency install failed — you can run "pnpm install" manually.');
    p.log.warn(err instanceof Error ? err.message : String(err));
  }

  if (installed && result.appliedRecipes.length > 0) {
    const postInstallSpinner = p.spinner();
    postInstallSpinner.start('Running recipe setup steps');
    try {
      await runPostInstalls(result.appliedRecipes, { outputDir, projectName });
      postInstallSpinner.stop('Recipe setup complete.');
    } catch (err) {
      postInstallSpinner.stop('Recipe setup failed — check the messages above for manual steps.');
      p.log.warn(err instanceof Error ? err.message : String(err));
    }
  }

  p.outro(
    [
      `Done! Next steps:`,
      `  cd ${projectName}/api && pnpm dev   # API on http://localhost:3000 (docs at /api/docs)`,
      `  cd ${projectName}/app && pnpm dev   # Frontend dev server`,
    ].join('\n'),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
