import { promises as fs } from 'node:fs';
import path from 'node:path';

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function listFilesRecursive(dir: string): Promise<string[]> {
  if (!(await pathExists(dir))) return [];
  const out: string[] = [];
  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  await walk(dir);
  return out;
}

/**
 * Copies every file under `srcDir` into `destDir`, preserving relative paths.
 * Throws if a file would overwrite one already present in destDir, unless `overwrite` is set —
 * this catches recipe file collisions instead of silently clobbering an earlier recipe's output.
 */
export async function copyTree(
  srcDir: string,
  destDir: string,
  opts: { overwrite?: boolean; onCollision?: (relPath: string) => void } = {},
): Promise<void> {
  const files = await listFilesRecursive(srcDir);
  for (const src of files) {
    const rel = path.relative(srcDir, src);
    const dest = path.join(destDir, rel);
    if (!opts.overwrite && (await pathExists(dest))) {
      if (opts.onCollision) {
        opts.onCollision(rel);
        continue;
      }
      throw new Error(`File collision: "${rel}" already exists in the output directory.`);
    }
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(src, dest);
  }
}

const TEXT_FILE_EXTENSIONS = new Set([
  '.json',
  '.md',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.html',
  '.yml',
  '.yaml',
  '.env',
]);

// Dotfiles with no further extension (path.extname returns '' for these) that recipes may need
// to inject into or that placeholder substitution should still consider text.
const TEXT_DOTFILES = new Set(['.gitignore', '.dockerignore', '.npmrc']);

export function isTextFile(filePath: string): boolean {
  const base = path.basename(filePath);
  if (base.startsWith('.env')) return true;
  if (TEXT_DOTFILES.has(base)) return true;
  return TEXT_FILE_EXTENSIONS.has(path.extname(filePath));
}

/**
 * Walks up from `startDir` until it finds a directory containing package.json.
 * Robust to running either unbundled (tsx, from src/engine/) or bundled (tsup's single-file
 * dist/cli.js) where the module's own directory depth relative to the package root differs.
 */
export async function findPackageRoot(startDir: string): Promise<string> {
  let dir = startDir;
  while (true) {
    if (await pathExists(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not locate package.json above "${startDir}".`);
    }
    dir = parent;
  }
}
