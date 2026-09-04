# Recipes

- **`bundle/prisma-betterauth-casl-stripe`** — the v1 golden-path bundle. Currently implements only
  the auth + Prisma slice (Postgres via Docker Compose, Prisma with the driver-adapter pattern,
  Better Auth wired into NestJS via `@thallesp/nestjs-better-auth`, email+password with a
  console-log email stub, a global `AuthGuard`, `@CurrentUser()`). Tenancy, CASL RBAC, and Stripe
  billing are not built yet — they land as extensions to this same recipe in follow-up passes (see
  its `manifest.ts` description and `docs/product-scope.md` §7).
- **`auth-extra/jwt-plugin`** — optional, off by default, `requires` the bundle above. Adds Better
  Auth's `jwt()`/`bearer()` plugins so a `GET /auth/token` endpoint can mint a signed JWT from the
  active session, for callers other than this API that need to verify identity independently. Purely
  additive — the native cookie session works identically whether or not this is selected.

The generator engine (`src/engine/`) is built against the contract below and is unit-tested against
small fixture recipes in `tests/fixtures/recipes/` (kept deliberately separate from the recipes
above so engine tests don't churn as real recipes evolve).

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

## Gotchas hit while building `prisma-betterauth-casl-stripe` (worth knowing before extending it)

- **NestJS 11, not 10.** `@thallesp/nestjs-better-auth` peers on `@nestjs/common`/`core` `^11.1.6`
  and Express `^5.1.0`; this forced the base template itself off NestJS 10. Any future recipe
  touching the API needs to stay compatible with Nest 11 (or the base template bumps again, deliberately).
- **`npm view`'s caret-range "latest" isn't necessarily what gets installed.** Pinning a floor like
  `^11.0.0` sometimes resolved to the literal floor version in this pnpm setup, not the newest
  matching patch — and the floor was occasionally a broken/deprecated release (e.g. `@nestjs/swagger
  11.0.0`'s own `@nestjs/mapped-types` dependency didn't support Nest 11; `@better-auth/cli` is
  deprecated in favor of the `auth` package entirely). Always verify the *resolved* version after a
  real `pnpm install`, not just that the range is syntactically plausible.
- **Prisma 7 requires `output` in the generator block and moved the connection `url` out of
  `schema.prisma` into `prisma.config.ts`** (`datasource: { url: env('DATABASE_URL') }`). Don't
  copy pre-7 schema.prisma examples verbatim.
- **A custom Prisma client `output` under `src/` needs explicit `nest-cli.json` asset-copying**
  (`compilerOptions.assets`) or `dist/` won't contain it — `tsc`/`nest build` only compiles `.ts`
  files, it doesn't copy the generated client's `.js`/`.wasm`/`schema.prisma`/etc. Use an unfiltered
  glob (`"generated/**/*"`); an extension-filtered one is tempting but easy to under-specify (we
  first missed `.wasm` and then `schema.prisma` itself, which silently broke every model accessor
  at runtime with no file-not-found error — see below).
- **`prisma migrate dev` does not reliably re-embed the schema into the generated client's own
  bundled `schema.prisma` copy.** Symptom: every model on the client is `undefined` at runtime
  (`Object.keys(prisma)` shows only `$`-prefixed methods) with no error until you actually call a
  model method, and Better Auth reports "Model user does not exist in the database" even though the
  table is really there. Fix: run `prisma generate` again *after* `migrate dev`, not just before it
  — see `postInstall.ts`'s ordering.
- **pnpm's strict/isolated `node_modules` won't let the generated client resolve packages it needs
  at runtime unless they're the API package's own direct dependencies** — we hit this for `zod`
  (needed for `auth.ts`'s exported type to be portable; TS2742) and `@prisma/client-runtime-utils`
  (needed by the generated client itself; `MODULE_NOT_FOUND` at runtime, not at type-check time).
  If a future Prisma/Better Auth bump introduces a similar error, suspect this first.
- `@thallesp/nestjs-better-auth`'s global `AuthGuard` protects every route by default — anything that
  must stay public (health checks, webhooks) needs `@AllowAnonymous()` explicitly. The base
  template's `/health` route has a dedicated inject marker for exactly this.

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
