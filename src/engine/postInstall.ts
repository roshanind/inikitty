import { createJiti } from 'jiti';
import type { DiscoveredRecipe, PostInstallContext, PostInstallFn } from './types.js';

const jiti = createJiti(import.meta.url);

async function loadPostInstall(postInstallPath: string): Promise<PostInstallFn> {
  const mod = await jiti.import(postInstallPath);
  const fn = (mod as { default?: PostInstallFn }).default;
  if (typeof fn !== 'function') {
    throw new Error(`"${postInstallPath}" must have a default export function.`);
  }
  return fn;
}

/** Runs each resolved recipe's postInstall.ts (if present) in order, sequentially. */
export async function runPostInstalls(
  recipes: DiscoveredRecipe[],
  ctx: PostInstallContext,
): Promise<void> {
  for (const recipe of recipes) {
    if (!recipe.postInstallPath) continue;
    const fn = await loadPostInstall(recipe.postInstallPath);
    await fn(ctx);
  }
}
