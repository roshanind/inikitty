import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { generateMultiAxis } from '../../src/engine/apply.js';
import { RecipeResolutionError } from '../../src/engine/resolve.js';

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'multi-axis');
const rootTemplateDir = path.join(fixturesDir, 'root');
const backendBaseDir = path.join(fixturesDir, 'backend-base');
const backendRecipesDir = path.join(fixturesDir, 'backend-recipes');
const frontendBaseDir = path.join(fixturesDir, 'frontend-base');
const frontendRecipesDir = path.join(fixturesDir, 'frontend-recipes');

let tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tmpDirs = [];
});

async function freshOutputDir(): Promise<string> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'inikitty-multi-axis-'));
  tmpDirs.push(base);
  return path.join(base, 'generated');
}

describe('generateMultiAxis', () => {
  it('applies both axes into one output tree, root template first', async () => {
    const outputDir = await freshOutputDir();

    const result = await generateMultiAxis({
      rootTemplateDir,
      outputDir,
      projectName: 'Multi Axis App',
      axes: [
        { recipesDir: backendRecipesDir, baseTemplateDir: backendBaseDir, selection: { bundle: 'alpha', categories: [] } },
        { recipesDir: frontendRecipesDir, baseTemplateDir: frontendBaseDir, selection: { categories: ['needs-alpha'] } },
      ],
    });

    expect(result.appliedRecipes.map((r) => r.manifest.id)).toEqual(['alpha', 'needs-alpha']);

    // root template + both axes' base + both axes' recipe files all landed
    await expect(fs.readFile(path.join(outputDir, 'api', 'marker.txt'), 'utf8')).resolves.toContain(
      'backend base file',
    );
    await expect(fs.readFile(path.join(outputDir, 'api', 'alpha.txt'), 'utf8')).resolves.toContain(
      'alpha backend file',
    );
    await expect(fs.readFile(path.join(outputDir, 'app', 'marker.txt'), 'utf8')).resolves.toContain(
      'frontend base file',
    );
    await expect(fs.readFile(path.join(outputDir, 'app', 'needs-alpha.txt'), 'utf8')).resolves.toContain(
      'needs alpha frontend file',
    );

    // both axes' injections landed at the root template's marker, backend axis first (applied
    // first), and the marker itself was stripped only once, after both axes ran.
    const agentsMd = await fs.readFile(path.join(outputDir, 'AGENTS.md'), 'utf8');
    expect(agentsMd).toContain('- alpha backend section');
    expect(agentsMd).toContain('- needs-alpha frontend section');
    expect(agentsMd.indexOf('alpha backend section')).toBeLessThan(
      agentsMd.indexOf('needs-alpha frontend section'),
    );
    expect(agentsMd).not.toContain('@inikitty:inject:');
  });

  it('lets a frontend-axis recipe requiresAnyOf a backend-axis bundle id via externallySatisfiedIds', async () => {
    const outputDir = await freshOutputDir();

    // Without the backend axis selecting 'alpha', the frontend's needs-alpha can't resolve.
    await expect(
      generateMultiAxis({
        rootTemplateDir,
        outputDir,
        projectName: 'Multi Axis App',
        axes: [
          { recipesDir: backendRecipesDir, baseTemplateDir: backendBaseDir, selection: { categories: [] } },
          { recipesDir: frontendRecipesDir, baseTemplateDir: frontendBaseDir, selection: { categories: ['needs-alpha'] } },
        ],
      }),
    ).rejects.toThrow(RecipeResolutionError);
  });

  it('throws when the output directory already exists and is not empty', async () => {
    const outputDir = await freshOutputDir();
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, 'existing.txt'), 'hi', 'utf8');

    await expect(
      generateMultiAxis({
        rootTemplateDir,
        outputDir,
        projectName: 'wont-work',
        axes: [
          { recipesDir: backendRecipesDir, baseTemplateDir: backendBaseDir, selection: { bundle: 'alpha', categories: [] } },
          { recipesDir: frontendRecipesDir, baseTemplateDir: frontendBaseDir, selection: { categories: [] } },
        ],
      }),
    ).rejects.toThrow(/already exists/);
  });

  it('throws when rootTemplateDir does not exist', async () => {
    const outputDir = await freshOutputDir();

    await expect(
      generateMultiAxis({
        rootTemplateDir: path.join(fixturesDir, 'does-not-exist'),
        outputDir,
        projectName: 'wont-work',
        axes: [
          { recipesDir: backendRecipesDir, baseTemplateDir: backendBaseDir, selection: { bundle: 'alpha', categories: [] } },
        ],
      }),
    ).rejects.toThrow(/Root template directory not found/);
  });
});
