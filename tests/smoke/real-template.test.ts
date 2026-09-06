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
      'api/src/app.controller.spec.ts',
      'api/src/app.service.ts',
      'api/src/common/filters/all-exceptions.filter.ts',
      'api/tsconfig.build.json',
      'api/test/app.e2e-spec.ts',
      'api/test/jest-e2e.js',
      'app/package.json',
      'app/tsconfig.json',
      'app/vite.config.ts',
      'app/index.html',
      'app/src/main.tsx',
      'app/src/App.tsx',
      '.env.example',
      '.gitignore',
      'AGENTS.md',
    ]) {
      await expect(fs.stat(path.join(outputDir, relPath))).resolves.toBeDefined();
    }

    const agentsMd = await fs.readFile(path.join(outputDir, 'AGENTS.md'), 'utf8');
    expect(agentsMd).toContain('Smoke Test App');
    expect(agentsMd).toContain('Never commit `.env`');
    expect(agentsMd).not.toContain('@inikitty:inject:');

    const apiPkg = JSON.parse(await fs.readFile(path.join(outputDir, 'api', 'package.json'), 'utf8'));
    expect(apiPkg.name).toBe('smoke-test-app-api');
    expect(apiPkg.scripts.test).toBe('jest');
    expect(apiPkg.scripts['test:e2e']).toBe('jest --config ./test/jest-e2e.js');
    expect(apiPkg.devDependencies.jest).toBeDefined();
    expect(apiPkg.devDependencies['@nestjs/testing']).toBeDefined();
    expect(apiPkg.devDependencies.supertest).toBeDefined();

    const appPkg = JSON.parse(await fs.readFile(path.join(outputDir, 'app', 'package.json'), 'utf8'));
    expect(appPkg.name).toBe('smoke-test-app-app');

    const appControllerSpec = await fs.readFile(
      path.join(outputDir, 'api', 'src', 'app.controller.spec.ts'),
      'utf8',
    );
    expect(appControllerSpec).toContain("name: 'Smoke Test App'");

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
      'api/prisma/enable-rls.sql',
      'api/src/prisma/prisma.service.ts',
      'api/src/prisma/prisma.module.ts',
      'api/src/auth/auth.ts',
      'api/src/auth/current-user.decorator.ts',
      'api/src/tenancy/tenant.extension.ts',
      'api/src/tenancy/tenant-context.ts',
      'api/src/tenancy/tenancy.module.ts',
      'api/src/tenancy/tenants.controller.ts',
      'api/src/casl/policies.decorator.ts',
      'api/src/casl/policies.guard.ts',
      'api/src/casl/casl.module.ts',
      'api/src/billing/billing.module.ts',
      'api/src/billing/billing.controller.ts',
      'api/src/billing/billing.service.ts',
      'api/src/billing/active-subscription.guard.ts',
      'api/src/billing/requires-active-subscription.decorator.ts',
      'api/src/billing/dto/create-checkout-session.dto.ts',
      'api/src/projects/projects.module.ts',
      'api/src/projects/projects.controller.ts',
      'api/src/projects/projects.service.ts',
      'api/src/projects/dto/create-project.dto.ts',
      'api/src/projects/dto/update-project.dto.ts',
      'api/src/projects/dto/project-response.dto.ts',
      'api/src/projects/projects.service.spec.ts',
      'api/test/golden-path.e2e-spec.ts',
      'api/test/__mocks__/thallesp-nestjs-better-auth.ts',
      'docs/adding-a-resource.md',
      'pnpm-workspace.yaml',
      'packages/shared/package.json',
      'packages/shared/tsconfig.json',
      'packages/shared/tsconfig.esm.json',
      'packages/shared/src/casl/action.enum.ts',
      'packages/shared/src/casl/subjects.ts',
      'packages/shared/src/casl/ability.factory.ts',
      'app/src/lib/auth-client.ts',
      'app/src/lib/api-client.ts',
      'app/src/lib/query-client.ts',
      'app/src/lib/use-ability.ts',
      'app/src/features/auth/LoginPage.tsx',
      'app/src/features/auth/SignupPage.tsx',
      'app/src/features/auth/RequireAuth.tsx',
      'app/src/features/projects/api.ts',
      'app/src/features/projects/ProjectsListPage.tsx',
      'app/src/features/projects/ProjectDetailPage.tsx',
    ]) {
      await expect(fs.stat(path.join(outputDir, relPath))).resolves.toBeDefined();
    }

    const mainTs = await fs.readFile(path.join(outputDir, 'api', 'src', 'main.ts'), 'utf8');
    expect(mainTs).toContain('bodyParser: false,');
    expect(mainTs).toContain("import { json, raw, type NextFunction, type Request, type Response } from 'express';");
    expect(mainTs).toContain("req.originalUrl === '/billing/webhook'");
    expect(mainTs).toContain('app.enableCors({ origin: process.env.APP_URL ?? true, credentials: true });');
    expect(mainTs).not.toContain('@inikitty:inject:');

    const moduleTs = await fs.readFile(path.join(outputDir, 'api', 'src', 'app.module.ts'), 'utf8');
    expect(moduleTs).toContain("import { AuthModule } from '@thallesp/nestjs-better-auth';");
    expect(moduleTs).toContain('AuthModule.forRoot({ auth }),');
    expect(moduleTs).toContain('PrismaModule,');
    expect(moduleTs).toContain('TenancyModule,');
    expect(moduleTs).toContain('CaslModule,');
    expect(moduleTs).toContain('BillingModule,');
    expect(moduleTs).toContain('ProjectsModule,');
    expect(moduleTs).not.toContain('@inikitty:inject:');

    const policiesGuardTs = await fs.readFile(path.join(outputDir, 'api', 'src', 'casl', 'policies.guard.ts'), 'utf8');
    expect(policiesGuardTs).toContain('Scope.REQUEST');

    const schemaPrisma = await fs.readFile(path.join(outputDir, 'api', 'prisma', 'schema.prisma'), 'utf8');
    expect(schemaPrisma).toContain('model Tenant');
    expect(schemaPrisma).toContain('model Membership');
    expect(schemaPrisma).toContain('model Subscription');
    expect(schemaPrisma).toContain('model Project');
    expect(schemaPrisma).toContain('enum MembershipRole');
    expect(schemaPrisma).toContain('enum SubscriptionStatus');

    const enableRlsSql = await fs.readFile(path.join(outputDir, 'api', 'prisma', 'enable-rls.sql'), 'utf8');
    expect(enableRlsSql).toContain('ALTER TABLE "subscription" ENABLE ROW LEVEL SECURITY;');
    expect(enableRlsSql).toContain('ALTER TABLE "project" ENABLE ROW LEVEL SECURITY;');

    const appTsx = await fs.readFile(path.join(outputDir, 'app', 'src', 'App.tsx'), 'utf8');
    expect(appTsx).toContain('<Routes>');
    expect(appTsx).toContain('path="/login"');
    expect(appTsx).toContain('path="/projects"');
    expect(appTsx).toContain('path="/projects/:id"');
    expect(appTsx).not.toContain('@inikitty:inject:');

    const mainTsx = await fs.readFile(path.join(outputDir, 'app', 'src', 'main.tsx'), 'utf8');
    expect(mainTsx).toContain('QueryClientProvider');
    expect(mainTsx).toContain('BrowserRouter');
    expect(mainTsx).toContain('ThemeProvider');
    expect(mainTsx).toContain('CssBaseline');
    expect(mainTsx).not.toContain('@inikitty:inject:');

    const sharedPkgJson = JSON.parse(
      await fs.readFile(path.join(outputDir, 'packages', 'shared', 'package.json'), 'utf8'),
    );
    expect(sharedPkgJson.exports['.'].require).toBe('./dist/cjs/index.js');
    expect(sharedPkgJson.exports['.'].import).toBe('./dist/esm/index.js');

    const authTs = await fs.readFile(path.join(outputDir, 'api', 'src', 'auth', 'auth.ts'), 'utf8');
    expect(authTs).toContain("import { bearer, jwt } from 'better-auth/plugins';");
    expect(authTs).toContain('jwt(),');
    expect(authTs).toContain('bearer(),');
    expect(authTs).toContain("requireEmailVerification: process.env.NODE_ENV !== 'test',");
    expect(authTs).not.toContain('@inikitty:inject:');

    const gitignore = await fs.readFile(path.join(outputDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('api/src/generated/');
    expect(gitignore).not.toContain('@inikitty:inject:');

    const apiPkg = JSON.parse(await fs.readFile(path.join(outputDir, 'api', 'package.json'), 'utf8'));
    expect(apiPkg.dependencies['better-auth']).toBeDefined();
    expect(apiPkg.dependencies['@thallesp/nestjs-better-auth']).toBeDefined();
    expect(apiPkg.dependencies['@prisma/client']).toBeDefined();
    expect(apiPkg.devDependencies.prisma).toBeDefined();
    expect(apiPkg.dependencies['@casl/ability']).toBeDefined();
    expect(apiPkg.dependencies['auth-smoke-app-shared']).toBe('workspace:*');
    expect(apiPkg.dependencies.stripe).toBeDefined();
    expect(apiPkg.dependencies.express).toBeDefined();
    expect(apiPkg.jest.moduleNameMapper['^@thallesp/nestjs-better-auth$']).toBe(
      '<rootDir>/test/__mocks__/thallesp-nestjs-better-auth.ts',
    );

    const appPkg = JSON.parse(await fs.readFile(path.join(outputDir, 'app', 'package.json'), 'utf8'));
    expect(appPkg.dependencies['@casl/ability']).toBeDefined();
    expect(appPkg.dependencies['auth-smoke-app-shared']).toBe('workspace:*');
    expect(appPkg.dependencies['react-router-dom']).toBeDefined();
    expect(appPkg.dependencies['@tanstack/react-query']).toBeDefined();
    expect(appPkg.dependencies['better-auth']).toBeDefined();
    expect(appPkg.dependencies['@mui/material']).toBeDefined();
    expect(appPkg.dependencies['@emotion/react']).toBeDefined();
    expect(appPkg.dependencies['@emotion/styled']).toBeDefined();

    const loginPageTsx = await fs.readFile(
      path.join(outputDir, 'app', 'src', 'features', 'auth', 'LoginPage.tsx'),
      'utf8',
    );
    expect(loginPageTsx).toContain("from '@mui/material/TextField'");

    const sharedPkg = JSON.parse(
      await fs.readFile(path.join(outputDir, 'packages', 'shared', 'package.json'), 'utf8'),
    );
    expect(sharedPkg.name).toBe('auth-smoke-app-shared');

    const envExample = await fs.readFile(path.join(outputDir, '.env.example'), 'utf8');
    expect(envExample).toContain('DATABASE_URL=postgresql://postgres:postgres@localhost:5432/auth-smoke-app');
    expect(envExample).toContain('APP_DATABASE_URL=postgresql://app_role:');
    expect(envExample).toContain('BETTER_AUTH_SECRET=');
    expect(envExample).toContain('BETTER_AUTH_URL=');
    expect(envExample).toContain('APP_URL=');
    expect(envExample).toContain('STRIPE_SECRET_KEY=');
    expect(envExample).toContain('STRIPE_WEBHOOK_SECRET=');
    expect(envExample).not.toContain('@inikitty:inject:');

    const compose = await fs.readFile(path.join(outputDir, 'docker-compose.yml'), 'utf8');
    expect(compose).toContain('POSTGRES_DB: auth-smoke-app');

    const agentsMd = await fs.readFile(path.join(outputDir, 'AGENTS.md'), 'utf8');
    expect(agentsMd).toContain('Auth Smoke App');
    expect(agentsMd).toContain('TenantContext.getPrisma()');
    expect(agentsMd).toContain('JWT plugin');
    expect(agentsMd).toContain('Never commit `.env`');
    expect(agentsMd).not.toContain('@inikitty:inject:');
    // Bundle-first ordering: the bundle's real content should appear before jwt-plugin's small
    // addendum, and both before the base template's own trailing guardrails section.
    expect(agentsMd.indexOf('## Stack')).toBeLessThan(agentsMd.indexOf('## JWT plugin'));
    expect(agentsMd.indexOf('## JWT plugin')).toBeLessThan(agentsMd.indexOf('Never remove'));
  });
});
