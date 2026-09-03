import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isTextFile, listFilesRecursive, pathExists } from './fsUtils.js';
import type { DiscoveredRecipe } from './types.js';

const INJECT_DIR_SUFFIX = '.inject';

function markerToken(markerName: string): string {
  return `@inikitty:inject:${markerName}`;
}

/**
 * Applies one recipe's inject/ snippets to the already-copied output tree.
 *
 * A snippet lives at `inject/<targetRelPath>.inject/<markerName>.<ext>` and is inserted
 * immediately above the base template's `// @inikitty:inject:<markerName>` marker line in
 * `<outputDir>/<targetRelPath>` — so snippets from recipes applied later land below snippets
 * from recipes applied earlier, directly above the still-remaining marker.
 */
export async function applyInjections(recipe: DiscoveredRecipe, outputDir: string): Promise<void> {
  if (!(await pathExists(recipe.injectDir))) return;

  const snippetFiles = await listFilesRecursive(recipe.injectDir);
  for (const snippetPath of snippetFiles) {
    const relFromInjectDir = path.relative(recipe.injectDir, snippetPath);
    const dirPart = path.dirname(relFromInjectDir);
    if (!dirPart.endsWith(INJECT_DIR_SUFFIX)) {
      throw new Error(
        `Invalid inject snippet path "${relFromInjectDir}" in recipe "${recipe.manifest.id}": ` +
          `its parent directory must end in "${INJECT_DIR_SUFFIX}" (e.g. "api/src/app.module.ts.inject/imports.ts").`,
      );
    }
    const targetRelPath = dirPart.slice(0, -INJECT_DIR_SUFFIX.length);
    const markerName = path.basename(snippetPath, path.extname(snippetPath));
    const targetPath = path.join(outputDir, targetRelPath);

    if (!(await pathExists(targetPath))) {
      throw new Error(
        `Recipe "${recipe.manifest.id}" targets injection file "${targetRelPath}", which doesn't ` +
          `exist in the output directory.`,
      );
    }

    const snippet = (await fs.readFile(snippetPath, 'utf8')).replace(/\n+$/, '');
    const targetContent = await fs.readFile(targetPath, 'utf8');
    const token = markerToken(markerName);
    const lines = targetContent.split('\n');
    const markerLineIndex = lines.findIndex((line) => line.includes(token));

    if (markerLineIndex === -1) {
      throw new Error(
        `Recipe "${recipe.manifest.id}" injects into marker "${markerName}" in "${targetRelPath}", ` +
          `but no line containing "${token}" was found.`,
      );
    }

    const indent = lines[markerLineIndex]?.match(/^\s*/)?.[0] ?? '';
    const snippetLines = snippet.split('\n').map((line) => `${indent}${line}`);
    lines.splice(markerLineIndex, 0, ...snippetLines);
    await fs.writeFile(targetPath, lines.join('\n'), 'utf8');
  }
}

/** Removes every remaining `@inikitty:inject:*` marker comment line from the output tree. */
export async function stripMarkers(outputDir: string): Promise<void> {
  const files = (await listFilesRecursive(outputDir)).filter(isTextFile);
  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf8');
    if (!content.includes('@inikitty:inject:')) continue;
    const filtered = content
      .split('\n')
      .filter((line) => !line.includes('@inikitty:inject:'))
      .join('\n');
    await fs.writeFile(filePath, filtered, 'utf8');
  }
}
