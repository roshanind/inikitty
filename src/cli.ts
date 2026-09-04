#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as p from '@clack/prompts';
import { generate } from './engine/apply.js';
import { discoverRecipes } from './engine/discover.js';
import { findPackageRoot } from './engine/fsUtils.js';
import { runPostInstalls } from './engine/postInstall.js';
import { BUNDLE_CATEGORY } from './engine/types.js';
import type { GenerateResult } from './engine/apply.js';

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
  const recipesDir = path.join(packageRoot, 'recipes');
  const discovered = await discoverRecipes(recipesDir);
  const bundles = discovered.filter((r) => r.manifest.category === BUNDLE_CATEGORY);
  const categoryRecipes = discovered.filter((r) => r.manifest.category !== BUNDLE_CATEGORY);

  let bundle: string | undefined;
  if (bundles.length > 0) {
    const choice = await p.select({
      message: 'Pick a golden-path bundle',
      options: bundles.map((r) => ({
        value: r.manifest.id,
        label: r.manifest.id,
        hint: r.manifest.description,
      })),
    });
    if (p.isCancel(choice)) {
      p.cancel('Cancelled.');
      process.exit(1);
    }
    bundle = choice;
  } else {
    p.log.info('No golden-path bundle is available yet — generating the base skeleton only.');
  }

  let categories: string[] = [];
  if (categoryRecipes.length > 0) {
    const choice = await p.multiselect({
      message: 'Additional options',
      options: categoryRecipes.map((r) => ({
        value: r.manifest.id,
        label: r.manifest.id,
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

  const outputDir = path.resolve(process.cwd(), projectName);

  const spinner = p.spinner();
  spinner.start('Generating project files');
  let result: GenerateResult;
  try {
    result = await generate({
      outputDir,
      projectName,
      selection: { bundle, categories },
      // postInstall scripts (e.g. `prisma migrate`) need installed deps to run against, so they
      // run after `pnpm install` below, not as part of generate() itself.
      runPostInstall: false,
    });
    spinner.stop('Project files generated.');
  } catch (err) {
    spinner.stop('Generation failed.');
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const installSpinner = p.spinner();
  installSpinner.start('Installing dependencies (pnpm install in api/ and app/)');
  let installed = false;
  try {
    await runCommand('pnpm', ['install'], path.join(outputDir, 'api'));
    await runCommand('pnpm', ['install'], path.join(outputDir, 'app'));
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
