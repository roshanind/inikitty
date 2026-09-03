import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { generate } from '../../src/engine/apply.js';

// Exercises the REAL templates/base and REAL recipes/ (currently empty) together, as a smoke
// check that the actual shipped template is well-formed — separate from the fixture-driven unit
// tests, which intentionally use a small fake base/recipes set so they don't churn as the real
// template evolves.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const baseTemplateDir = path.join(repoRoot, 'templates', 'base');
const recipesDir = path.join(repoRoot, 'recipes');

let tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tmpDirs = [];
});

describe('real base template', () => {
  it('generates a well-formed project with no recipes selected', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'inikitty-smoke-'));
    tmpDirs.push(parent);
    const outputDir = path.join(parent, 'generated');

    const result = await generate({
      baseTemplateDir,
      recipesDir,
      outputDir,
      projectName: 'Smoke Test App',
      selection: { categories: [] },
    });

    expect(result.appliedRecipes).toEqual([]);

    for (const relPath of [
      'api/package.json',
      'api/tsconfig.json',
      'api/nest-cli.json',
      'api/src/main.ts',
      'api/src/app.module.ts',
      'api/src/app.controller.ts',
      'api/src/app.service.ts',
      'api/src/common/filters/all-exceptions.filter.ts',
      'app/package.json',
      'app/tsconfig.json',
      'app/vite.config.ts',
      'app/index.html',
      'app/src/main.tsx',
      'app/src/App.tsx',
      '.env.example',
      '.gitignore',
    ]) {
      await expect(fs.stat(path.join(outputDir, relPath))).resolves.toBeDefined();
    }

    const apiPkg = JSON.parse(await fs.readFile(path.join(outputDir, 'api', 'package.json'), 'utf8'));
    expect(apiPkg.name).toBe('smoke-test-app-api');

    const appPkg = JSON.parse(await fs.readFile(path.join(outputDir, 'app', 'package.json'), 'utf8'));
    expect(appPkg.name).toBe('smoke-test-app-app');

    const moduleContent = await fs.readFile(path.join(outputDir, 'api', 'src', 'app.module.ts'), 'utf8');
    expect(moduleContent).not.toContain('@inikitty:inject:');

    const envExample = await fs.readFile(path.join(outputDir, '.env.example'), 'utf8');
    expect(envExample).not.toContain('@inikitty:inject:');

    const indexHtml = await fs.readFile(path.join(outputDir, 'app', 'index.html'), 'utf8');
    expect(indexHtml).toContain('<title>Smoke Test App</title>');

    const appTsx = await fs.readFile(path.join(outputDir, 'app', 'src', 'App.tsx'), 'utf8');
    expect(appTsx).toContain("const projectName = 'Smoke Test App';");
  });
});
