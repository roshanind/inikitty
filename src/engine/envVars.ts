import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathExists } from './fsUtils.js';
import type { DiscoveredRecipe, EnvVarSpec } from './types.js';

const ENV_MARKER = '@inikitty:inject:env-vars';

/**
 * Collects envVars from all resolved recipes (last recipe wins on a duplicate key) and appends
 * them, one per line, at the `# @inikitty:inject:env-vars` marker in .env.example.
 */
export async function mergeEnvVars(recipes: DiscoveredRecipe[], outputDir: string): Promise<void> {
  const envPath = path.join(outputDir, '.env.example');
  if (!(await pathExists(envPath))) return;

  const merged = new Map<string, EnvVarSpec>();
  for (const recipe of recipes) {
    for (const envVar of recipe.manifest.envVars ?? []) {
      merged.set(envVar.key, envVar);
    }
  }
  if (merged.size === 0) return;

  const content = await fs.readFile(envPath, 'utf8');
  const lines = content.split('\n');
  const markerLineIndex = lines.findIndex((line) => line.includes(ENV_MARKER));
  if (markerLineIndex === -1) {
    throw new Error(`.env.example is missing the "${ENV_MARKER}" marker line.`);
  }

  const newLines = [...merged.values()].map((envVar) =>
    envVar.description
      ? `${envVar.key}=${envVar.example}  # ${envVar.description}`
      : `${envVar.key}=${envVar.example}`,
  );
  lines.splice(markerLineIndex, 0, ...newLines);
  await fs.writeFile(envPath, lines.join('\n'), 'utf8');
}
