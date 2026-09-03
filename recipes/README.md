# Recipes

This directory is empty for now — no bundle or category recipes ship yet (see `docs/product-scope.md`
§12, "Phase 1"). The generator engine (`src/engine/`) is fully built against the contract below and is
unit-tested against fixture recipes in `tests/fixtures/recipes/`; real recipes will be added here in a
follow-up pass.

## Folder contract

```
recipes/<category>/<id>/
  manifest.ts     # exports `manifest: RecipeManifest` (see src/engine/types.ts)
  files/          # files copied as-is into the generated project, mirroring its layout
                   # (e.g. files/api/src/foo.ts -> <output>/api/src/foo.ts)
  inject/         # snippets inserted at marker-comment injection points in files already
                   # present in the output (base template or an earlier recipe)
  postInstall.ts  # optional; default-exports (ctx: { outputDir, projectName }) => Promise<void>
```

`manifest.ts` must export a `manifest` (named or default) whose `id` and `category` match the
folder it lives in (`recipes/<category>/<id>/`).

## Recipe kinds

- **`bundle`** — the one reserved category. Exactly one bundle recipe must be selected whenever
  any exist. Used for integration-coupled choices that must be tested together (ORM + auth +
  tenancy + RBAC wiring), never split into independently-toggleable pieces.
- Everything else (e.g. `ui`, `ai-format`) is a **category recipe** — independent of other
  categories, freely mixable, selected zero-or-more at a time.

Declare `conflicts`/`requires` (other recipe ids) in the manifest to constrain valid combinations;
the engine's resolver (`src/engine/resolve.ts`) enforces these before generation runs.

## Injecting into a file

If the target file (e.g. `templates/base/api/src/app.module.ts`) contains a marker comment:

```ts
// @inikitty:inject:module-imports
```

a recipe supplies the snippet to insert at:

```
inject/api/src/app.module.ts.inject/module-imports.ts
```

i.e. the snippet's directory is the target's relative path with `.inject` appended, and the
snippet's filename (sans extension) is the marker name. See `src/engine/inject.ts` for the exact
mechanics, or `tests/fixtures/recipes/` for a worked example used by the engine's unit tests.
