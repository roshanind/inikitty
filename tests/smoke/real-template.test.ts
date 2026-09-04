import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { generate } from '../../src/engine/apply.js';

// Exercises the REAL templates/base and REAL recipes/ together, as a smoke check that the actual
// shipped template and recipes are well-formed — separate from the fixture-driven unit tests,
// which intentionally use a small fake base/recipes set so they don't churn as these evolve.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const baseTemplateDir = path.join(repoRoot, 'templates', 'base');
const recipesDir = path.join(repoRoot, 'recipes');

let tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tmpDirs = [];
});

async function freshOutputDir(): Promise<string> {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'inikitty-smoke-'));
  tmpDirs.push(parent);
  return path.join(parent, 'generated');
}

describe('real base template', () => {
  it('generates a well-formed project with no bundle recipes available', async () => {
    const outputDir = await freshOutputDir();
    // No bundle recipe is selected here; the real recipes/ dir does have one now, so point at an
    // empty dir to exercise the "base template only" path (mirrors apply.test.ts's fixture case).
    const emptyRecipesDir = path.join(repoRoot, 'tests', 'fixtures', 'empty-recipes');

    const result = await generate({
      baseTemplateDir,
      recipesDir: emptyRecipesDir,
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

    const mainTs = await fs.readFile(path.join(outputDir, 'api', 'src', 'main.ts'), 'utf8');
    expect(mainTs).not.toContain('@inikitty:inject:');

    const envExample = await fs.readFile(path.join(outputDir, '.env.example'), 'utf8');
    expect(envExample).not.toContain('@inikitty:inject:');

    const gitignore = await fs.readFile(path.join(outputDir, '.gitignore'), 'utf8');
    expect(gitignore).not.toContain('@inikitty:inject:');

    const indexHtml = await fs.readFile(path.join(outputDir, 'app', 'index.html'), 'utf8');
    expect(indexHtml).toContain('<title>Smoke Test App</title>');

    const appTsx = await fs.readFile(path.join(outputDir, 'app', 'src', 'App.tsx'), 'utf8');
    expect(appTsx).toContain("const projectName = 'Smoke Test App';");
  });

  it('generates a well-formed project with the real golden-path bundle + jwt-plugin selected', async () => {
    const outputDir = await freshOutputDir();

    const result = await generate({
      baseTemplateDir,
      recipesDir,
      outputDir,
      projectName: 'Auth Smoke App',
      selection: { bundle: 'prisma-betterauth-casl-stripe', categories: ['jwt-plugin'] },
      runPostInstall: false, // postInstall needs Docker + installed deps; covered by manual e2e verification
    });

    expect(result.appliedRecipes.map((r) => r.manifest.id)).toEqual([
      'prisma-betterauth-casl-stripe',
      'jwt-plugin',
    ]);

    for (const relPath of [
      'docker-compose.yml',
      'api/prisma/schema.prisma',
      'api/src/prisma/prisma.service.ts',
      'api/src/prisma/prisma.module.ts',
      'api/src/auth/auth.ts',
      'api/src/auth/current-user.decorator.ts',
    ]) {
      await expect(fs.stat(path.join(outputDir, relPath))).resolves.toBeDefined();
    }

    const mainTs = await fs.readFile(path.join(outputDir, 'api', 'src', 'main.ts'), 'utf8');
    expect(mainTs).toContain('bodyParser: false,');
    expect(mainTs).not.toContain('@inikitty:inject:');

    const moduleTs = await fs.readFile(path.join(outputDir, 'api', 'src', 'app.module.ts'), 'utf8');
    expect(moduleTs).toContain("import { AuthModule } from '@thallesp/nestjs-better-auth';");
    expect(moduleTs).toContain('AuthModule.forRoot({ auth }),');
    expect(moduleTs).toContain('PrismaModule,');
    expect(moduleTs).not.toContain('@inikitty:inject:');

    const authTs = await fs.readFile(path.join(outputDir, 'api', 'src', 'auth', 'auth.ts'), 'utf8');
    expect(authTs).toContain("import { bearer, jwt } from 'better-auth/plugins';");
    expect(authTs).toContain('jwt(),');
    expect(authTs).toContain('bearer(),');
    expect(authTs).not.toContain('@inikitty:inject:');

    const gitignore = await fs.readFile(path.join(outputDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('api/src/generated/');
    expect(gitignore).not.toContain('@inikitty:inject:');

    const apiPkg = JSON.parse(await fs.readFile(path.join(outputDir, 'api', 'package.json'), 'utf8'));
    expect(apiPkg.dependencies['better-auth']).toBeDefined();
    expect(apiPkg.dependencies['@thallesp/nestjs-better-auth']).toBeDefined();
    expect(apiPkg.dependencies['@prisma/client']).toBeDefined();
    expect(apiPkg.devDependencies.prisma).toBeDefined();

    const envExample = await fs.readFile(path.join(outputDir, '.env.example'), 'utf8');
    expect(envExample).toContain('DATABASE_URL=postgresql://postgres:postgres@localhost:5432/auth-smoke-app');
    expect(envExample).toContain('BETTER_AUTH_SECRET=');
    expect(envExample).toContain('BETTER_AUTH_URL=');
    expect(envExample).not.toContain('@inikitty:inject:');

    const compose = await fs.readFile(path.join(outputDir, 'docker-compose.yml'), 'utf8');
    expect(compose).toContain('POSTGRES_DB: auth-smoke-app');
  });
});
