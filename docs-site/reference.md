# Module map

A quick reference for `src/engine/*` and the two entry points that call into it. Read `apply.ts`
first — it's the only module that calls all the others.

| File | Responsibility |
|---|---|
| `engine/apply.ts` | Orchestrates the full pipeline (see [The generation pipeline](/pipeline)); the only module every other engine module is called from. |
| `engine/discover.ts` | Scans `recipes/<category>/<id>/manifest.ts`. Loads manifests via `jiti`, not a plain `import()` — recipes ship as raw `.ts`, and jiti is what lets the built, plain-Node CLI load them without a compile step. |
| `engine/resolve.ts` | Turns a selection into an ordered recipe list: enforces exactly one bundle, checks `conflicts`/`requires`, orders bundle-first then alphabetically. |
| `engine/inject.ts` | The marker-splicing mechanism (see [Grafting code into a file you don't own](/pipeline#grafting-code-into-a-file-you-don-t-own)), plus `stripMarkers()`. |
| `engine/packageJson.ts` | Merges each recipe's `packageJsonPatch` into `api/` and `app/` `package.json`; last recipe wins a key collision, with a warning. |
| `engine/envVars.ts` | Merges `envVars` into `.env.example` at its own marker, before markers get stripped. |
| `engine/postInstall.ts` | Runs each resolved recipe's `postInstall.ts` in order — called by `apply.ts` by default, or separately by the CLI after `pnpm install`. |
| `engine/fsUtils.ts` | Collision-safe tree copy, text-file detection for substitution/stripping, and `findPackageRoot()` — walks up from wherever the running code lives until it finds a `package.json`, so path resolution works identically under `tsx` and the tsup-bundled CLI. |
| `cli.ts` | The `@clack/prompts` TUI: prompts, calls the engine, shells out to `pnpm`, calls `runPostInstalls()`. |
| `index.ts` | The programmatic API — what tests and manual verification scripts call instead of the TUI. |

## Where things live in a generated project

```
<project>/
  .env.example
  .gitignore
  docker-compose.yml        # from the auth bundle
  api/
    prisma.config.ts        # from the auth bundle
    prisma/schema.prisma    # from the auth bundle; models added by `auth generate`
    src/
      main.ts
      app.module.ts
      app.controller.ts
      app.service.ts
      common/filters/all-exceptions.filter.ts
      auth/                # from the auth bundle
        auth.ts
        current-user.decorator.ts
      prisma/              # from the auth bundle
        prisma.module.ts
        prisma.service.ts
      generated/prisma/    # build output — the generated Prisma client
  app/
    src/
      main.tsx
      App.tsx
```

## Testing strategy

- **`tests/unit/`** — engine internals against small fixture recipes (`tests/fixtures/`), kept
  deliberately separate from real recipes so they don't churn as real recipes evolve. Temp-dir
  only, no real installs.
- **`tests/smoke/`** — the real `templates/base` + real `recipes/`, one case with no bundle
  selected and one with `prisma-betterauth-casl-stripe` + `jwt-plugin` selected. File shape and
  injected content only (`runPostInstall: false`) — full behavioral verification (does
  signup/login actually work) is currently manual, done once per recipe change against a real
  Postgres container, not yet an automated CI job.
