#!/usr/bin/env tsx
/**
 * CI helper: generates a project for one bundle, copies .env.example's working local-dev
 * defaults into api/.env, and installs dependencies — mirroring exactly what `src/cli.ts` does
 * for a real user (single root `pnpm install` when the bundle wrote a `pnpm-workspace.yaml`,
 * otherwise separate installs in `api/`/`app/`), so this exercises the real generation +
 * dependency-resolution path, not a CI-specific approximation of it.
 *
 * Writes `<out>/.inikitty-ci-recipes.json` (the resolved recipe list) so a later CI step
 * (`golden-path-post-install.ts`) can run each recipe's `postInstall.ts` without re-discovering
 * recipes — `runPostInstalls()` needs the exact `DiscoveredRecipe[]` `generate()` already
 * resolved, and those objects are plain data (safe to round-trip through JSON).
 *
 * Usage: tsx scripts/golden-path-generate.ts --bundle <id> --out <dir> --project-name <name>
 */
import { spawn } from 'node:child_process';
import { copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generate } from '../src/engine/apply.js';
import { pathExists } from '../src/engine/fsUtils.js';

function arg(name: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  const value = idx === -1 ? undefined : process.argv[idx + 1];
  if (!value) {
    throw new Error(`Missing required --${name} argument.`);
  }
  return value;
}

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

async function main(): Promise<void> {
  const bundle = arg('bundle');
  const outputDir = path.resolve(arg('out'));
  const projectName = arg('project-name');

  const result = await generate({
    outputDir,
    projectName,
    selection: { bundle, categories: [] },
    runPostInstall: false, // postInstall needs installed deps; run separately, after install below.
  });

  await writeFile(
    path.join(outputDir, '.inikitty-ci-recipes.json'),
    JSON.stringify(result.appliedRecipes),
    'utf8',
  );

  const envExample = path.join(outputDir, '.env.example');
  if (await pathExists(envExample)) {
    await copyFile(envExample, path.join(outputDir, 'api', '.env'));
  }

  const isWorkspace = await pathExists(path.join(outputDir, 'pnpm-workspace.yaml'));
  if (isWorkspace) {
    await runCommand('pnpm', ['install'], outputDir);
  } else {
    await runCommand('pnpm', ['install'], path.join(outputDir, 'api'));
    await runCommand('pnpm', ['install'], path.join(outputDir, 'app'));
  }

  console.log(`Generated "${projectName}" (bundle: ${bundle}) at ${outputDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
