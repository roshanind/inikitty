/** The one category id the engine treats specially: exactly one (or zero, if none are
 * discovered yet) "bundle" recipe may be selected. Every other category is freely
 * mixable per §8.4 of the product scope. */
export const BUNDLE_CATEGORY = 'bundle';

export interface PackageJsonPatchFragment {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  /** Merged into package.json's `jest.moduleNameMapper` — narrowly scoped (not a generic `jest`
   * config merge) because that's the one shape a recipe legitimately needs: redirecting Jest's
   * resolution of a problematic dependency (e.g. an ESM-only package Jest's CJS runtime can't
   * load even with a transform configured) to a manual mock, without the engine needing to know
   * arbitrary Jest config shapes (arrays, nested transform tuples, etc.). */
  jestModuleNameMapper?: Record<string, string>;
}

export interface EnvVarSpec {
  key: string;
  example: string;
  description?: string;
}

export interface RecipeManifest {
  id: string;
  category: string;
  /** Short, human-friendly name shown in the CLI's selection prompt in place of `id` — `id` is
   * the technical identifier (folder name, `--bundle` value, `conflicts`/`requires` target) and
   * stays stable even if this changes; falls back to `id` when omitted. Keep this a name, not a
   * summary — `description` is what the prompt shows alongside it as the longer hint. */
  label?: string;
  description?: string;
  conflicts?: string[];
  requires?: string[];
  /** Satisfied if *any* one of these ids is selected — unlike `requires` (every id must be
   * selected). For a category recipe that works identically against more than one bundle (e.g.
   * jwt-plugin's auth.ts markers exist in every better-auth-based bundle), this avoids hardcoding
   * a single bundle id as a prerequisite when the real requirement is "one of these." */
  requiresAnyOf?: string[];
  /** Paths, relative to `recipesDir`, of shared fragment directories to copy/inject before this
   * recipe's own files/inject. Each entry is structured exactly like a recipe root (an optional
   * `files/` and/or `inject/` subtree) but lives outside the `<category>/<id>/` layout so
   * `discoverRecipes` never treats it as a recipe in its own right. This exists for content that
   * is byte-for-byte identical across recipes for a real reason (e.g. two bundles that only differ
   * in ORM but share every ORM-agnostic controller/DTO/FE file) — it lets that content live in one
   * place instead of being hand-copied into every recipe that needs it. */
  sharedDirs?: string[];
  packageJsonPatch?: {
    api?: PackageJsonPatchFragment;
    app?: PackageJsonPatchFragment;
  };
  envVars?: EnvVarSpec[];
}

/** One resolved `sharedDirs` entry: the on-disk locations of its files/ and inject/ subtrees. */
export interface SharedDir {
  filesDir: string;
  injectDir: string;
}

/** A manifest plus the on-disk locations of its files/, inject/, postInstall.ts, and any
 * `sharedDirs` it declares. */
export interface DiscoveredRecipe {
  manifest: RecipeManifest;
  dir: string;
  filesDir: string;
  injectDir: string;
  sharedDirs: SharedDir[];
  postInstallPath: string | undefined;
}

export interface RecipeSelection {
  bundle?: string;
  categories: string[];
}

export interface PostInstallContext {
  outputDir: string;
  projectName: string;
}

export type PostInstallFn = (ctx: PostInstallContext) => Promise<void> | void;

export interface GenerateOptions {
  /** Directory containing <category>/<id>/manifest.ts folders. Defaults to the package's own recipes/. */
  recipesDir?: string;
  /** Directory containing the base template (api/, app/, .env.example). Defaults to the package's own templates/base. */
  baseTemplateDir?: string;
  outputDir: string;
  projectName: string;
  selection: RecipeSelection;
  /** Set to skip actually invoking postInstall scripts (used by tests). */
  runPostInstall?: boolean;
}
