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
  description?: string;
  conflicts?: string[];
  requires?: string[];
  /** Satisfied if *any* one of these ids is selected — unlike `requires` (every id must be
   * selected). For a category recipe that works identically against more than one bundle (e.g.
   * jwt-plugin's auth.ts markers exist in every better-auth-based bundle), this avoids hardcoding
   * a single bundle id as a prerequisite when the real requirement is "one of these." */
  requiresAnyOf?: string[];
  packageJsonPatch?: {
    api?: PackageJsonPatchFragment;
    app?: PackageJsonPatchFragment;
  };
  envVars?: EnvVarSpec[];
}

/** A manifest plus the on-disk locations of its files/, inject/, and postInstall.ts. */
export interface DiscoveredRecipe {
  manifest: RecipeManifest;
  dir: string;
  filesDir: string;
  injectDir: string;
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
