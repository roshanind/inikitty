import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { generate } from '../../src/engine/apply.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const baseTemplateDir = path.join(fixturesDir, 'base');
const recipesDir = path.join(fixturesDir, 'recipes');

let tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tmpDirs = [];
});

async function freshOutputDir(): Promise<string> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'inikitty-apply-'));
  tmpDirs.push(base);
  return path.join(base, 'generated');
}

describe('generate (full pipeline)', () => {
  it('applies base + bundle + category recipe end to end', async () => {
    const outputDir = await freshOutputDir();

    const result = await generate({
      baseTemplateDir,
      recipesDir,
      outputDir,
      projectName: 'My Cool App',
      selection: { bundle: 'alpha', categories: ['widgets'] },
    });

    expect(result.appliedRecipes.map((r) => r.manifest.id)).toEqual(['alpha', 'widgets']);

    // files/ copied from both the bundle and the category recipe
    await expect(fs.readFile(path.join(outputDir, 'api', 'src', 'alpha.txt'), 'utf8')).resolves.toContain(
      'alpha file content',
    );
    await expect(
      fs.readFile(path.join(outputDir, 'app', 'src', 'widgets.txt'), 'utf8'),
    ).resolves.toContain('widgets file');

    // files/ copied from alpha's sharedDirs entry too, alongside its own files
    await expect(
      fs.readFile(path.join(outputDir, 'api', 'src', 'shared.txt'), 'utf8'),
    ).resolves.toContain('shared file content');

    // injection applied and markers stripped
    const moduleContent = await fs.readFile(path.join(outputDir, 'api', 'src', 'app.module.ts'), 'utf8');
    expect(moduleContent).toContain("import { AlphaModule } from './alpha.module';");
    expect(moduleContent).toContain('AlphaProvider,');
    expect(moduleContent).not.toContain('@inikitty:inject:');

    // sharedDirs inject applied before the recipe's own inject, both above the marker
    expect(moduleContent).toContain("import { SharedThing } from './shared.thing';");
    const sharedImportIndex = moduleContent.indexOf("import { SharedThing }");
    const ownImportIndex = moduleContent.indexOf("import { AlphaModule }");
    expect(sharedImportIndex).toBeGreaterThan(-1);
    expect(sharedImportIndex).toBeLessThan(ownImportIndex);

    // packageJsonPatch merged and {{projectNameKebab}} substituted
    const apiPkg = JSON.parse(await fs.readFile(path.join(outputDir, 'api', 'package.json'), 'utf8'));
    expect(apiPkg.name).toBe('my-cool-app-api');
    expect(apiPkg.dependencies['alpha-lib']).toBe('^1.0.0');
    const appPkg = JSON.parse(await fs.readFile(path.join(outputDir, 'app', 'package.json'), 'utf8'));
    expect(appPkg.name).toBe('my-cool-app-app');
    expect(appPkg.dependencies['widgets-lib']).toBe('^2.0.0');

    // envVars merged, marker stripped
    const env = await fs.readFile(path.join(outputDir, '.env.example'), 'utf8');
    expect(env).toContain('ALPHA_KEY=changeme');
    expect(env).not.toContain('@inikitty:inject:');

    // postInstall ran
    await expect(
      fs.readFile(path.join(outputDir, 'POSTINSTALL_ALPHA.txt'), 'utf8'),
    ).resolves.toBe('alpha ran for My Cool App');
  });

  it('generates the base template alone when no recipes are selected and none are required', async () => {
    const outputDir = await freshOutputDir();
    const emptyRecipesDir = path.join(fixturesDir, 'empty-recipes');

    const result = await generate({
      baseTemplateDir,
      recipesDir: emptyRecipesDir,
      outputDir,
      projectName: 'plain',
      selection: { categories: [] },
    });

    expect(result.appliedRecipes).toEqual([]);
    await expect(fs.readFile(path.join(outputDir, 'api', 'package.json'), 'utf8')).resolves.toContain(
      'plain-api',
    );
  });

  it('throws on a file collision between recipes instead of silently overwriting', async () => {
    const outputDir = await freshOutputDir();

    await expect(
      generate({
        baseTemplateDir,
        recipesDir,
        outputDir,
        projectName: 'collision-test',
        selection: { bundle: 'alpha', categories: ['collides-with-alpha'] },
      }),
    ).rejects.toThrow(/already written/);
  });

  it('throws when the output directory already exists and is not empty', async () => {
    const outputDir = await freshOutputDir();
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, 'existing.txt'), 'hi', 'utf8');

    await expect(
      generate({
        baseTemplateDir,
        recipesDir,
        outputDir,
        projectName: 'wont-work',
        selection: { bundle: 'alpha', categories: [] },
      }),
    ).rejects.toThrow(/already exists/);
  });
});
