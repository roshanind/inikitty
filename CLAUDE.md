# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

The **generator engine, CLI, and base template are implemented** (the "foundation pass"). The golden-path bundle recipe (`recipes/bundle/prisma-betterauth-casl-stripe/`) is being built incrementally as a single evolving recipe, per §8.4's "one tested integration unit" principle — **auth + Prisma are done and verified end-to-end against a real Postgres**; **tenancy, CASL RBAC, Stripe billing, and the `Projects` example resource are not built yet**. There's also one optional category recipe, `auth-extra/jwt-plugin`. No `AGENTS.md` generation or README/ARCHITECTURE.md assembly yet. See `recipes/README.md` for what each recipe actually contains and a list of non-obvious gotchas hit while building the auth slice (Prisma 7's config changes, NestJS asset-copying for a custom Prisma output path, pnpm's strict `node_modules` resolution) — read that before touching the recipe.

**Generated projects using the auth bundle require Node ≥22** (`api/package.json` declares this) — Better Auth's CLI (`auth generate`) depends on `Object.groupBy`, which isn't available on Node 20. The generator repo itself has no such constraint.

## Development commands

Package manager is **pnpm**. Run from the repo root:

```
pnpm install       # install generator deps
pnpm dev           # run the CLI from source via tsx (src/cli.ts), no build step
pnpm build         # bundle src/cli.ts + src/index.ts to dist/ via tsup (ESM, with .d.ts)
pnpm typecheck     # tsc --noEmit
pnpm lint          # eslint .
pnpm test          # vitest run (unit + smoke suites)
pnpm test:watch    # vitest in watch mode
```

Run a single test file: `pnpm vitest run tests/unit/resolve.test.ts`. Run by name: `pnpm vitest run -t "conflicts"`.

The CLI (`src/cli.ts`) is an interactive `@clack/prompts` TUI — it does not work with piped/non-TTY stdin, so don't try to script it with `printf ... | node dist/cli.js` for verification. To exercise generation programmatically (e.g. for manual smoke checks), import `generate` (and `runPostInstalls`, which the CLI now calls separately *after* `pnpm install` — postInstall scripts may depend on installed packages) from `src/index.ts` / `dist/index.js` directly and call them with an explicit `selection`, as the tests do.

To manually verify the `prisma-betterauth-casl-stripe` bundle end-to-end, you need Docker running and Node ≥22 available in the *generated* project (this repo's own tooling can stay on whatever Node version; only the generated `api/` needs 22+ — `nvm use 22` before running `npx auth generate`/`pnpm dev` there if your default is older).

## What Inikitty is

Inikitty is a scaffolding CLI (`npx create-inikitty`) that generates a fully wired, production-ready SaaS starter — not just a dependency list. Running the CLI produces a working app where auth, multi-tenancy, RBAC, and billing are already connected end-to-end, plus one example CRUD resource (`Projects`) that demonstrates the pattern for all future business logic.

Core principle: the deliverable is a working `POST /auth/signup` → tenant-scoped, RBAC-guarded `GET /projects` flow, not a `package.json` with the right dependencies listed.

## Architecture

The **generator** (this repo) is a separate codebase from what it **generates**. Keep this distinction in mind — most work here is on generator/recipe logic, not on application code.

### What gets generated

Three independently deployable pieces, of which the generator produces only the first two:

1. **API backend** — NestJS + TypeScript. Owns auth, multi-tenancy, RBAC, billing webhooks, business logic. REST API.
2. **App frontend** — Vite + React + TypeScript SPA, no SSR (it's behind login, no SEO need).
3. **Marketing site** — explicitly out of scope; left to the user, deployed separately, never shares a codebase with the app frontend.

### v1 golden-path stack (generated projects)

| Layer | Choice |
|---|---|
| Backend | NestJS + TypeScript |
| Database | PostgreSQL (row-level security for tenancy) |
| ORM | Prisma (default); Drizzle as a later bundle |
| Auth | Better Auth |
| Authorization | CASL (isomorphic, shared FE+BE rules) |
| Payments | Stripe (Billing + Customer Portal + Webhooks) |
| Validation | class-validator + class-transformer |
| Frontend | Vite + React + TypeScript |
| Server state | TanStack Query |
| UI components | shadcn/ui (default) |
| Monorepo | Turborepo (optional, prompt-gated) |

### The recipe/bundle system (core generator architecture)

The generator engine must never hardcode knowledge of specific tools (Prisma, Better Auth, etc.). It only knows how to discover recipes, read their manifests, and apply them to a base template — new stack combinations are added by writing a new recipe, not by modifying the engine.

Recipe folder contract:

```
recipes/<category>/<id>/
  manifest.ts     // id, category, conflicts/requires other recipe ids, packageJsonPatch, envVars
  files/          // files copied as-is into the generated project
  inject/         // snippets keyed to marker-comment injection points in the base template
  postInstall.ts  // e.g. run initial migration, seed roles
```

Two recipe kinds:

- **Category recipes** — independent choices (e.g. UI library, or the optional `jwt-plugin`) that can be freely mixed with any other category recipe.
- **Bundle recipes** — integration-coupled choices that must be tested together as one unit (e.g. ORM + auth provider + tenancy wiring + RBAC). v1 ships exactly one bundle: `prisma-betterauth-casl-stripe` (currently implementing only its auth + Prisma slice — see `recipes/README.md`). A second ORM means authoring a second bundle (`drizzle-betterauth-casl-stripe`), not making ORM and auth independently pluggable — that integration seam is where "loosely wired" bugs happen, so it stays a single tested unit until proven safe to split.

Engine responsibilities: discover recipes → resolve user selections into one bundle + zero-or-more category recipes (checking `conflicts`/`requires`) → apply base template then each recipe's `files/`/`inject/` in order → merge `packageJsonPatch` and install → run each recipe's `postInstall.ts` in order.

Even though v1 has only one bundle, the selection/resolution logic must be written generally from day one, and the golden-path CI check should run once per available bundle so it automatically covers future bundles.

**Implementation** (`src/engine/`, one module per responsibility — read `apply.ts` first, it's the orchestrator):
- `discover.ts` — scans `<recipesDir>/<category>/<id>/manifest.ts`. Manifests (and `postInstall.ts`) are loaded via `jiti` (`createJiti(import.meta.url)`), not a plain dynamic `import()` — recipes ship as raw, uncompiled `.ts` so authors get type safety against `RecipeManifest`, and jiti is what lets the *built* CLI (plain Node, no ts-node) load them at runtime. Don't swap this back to `import()`.
- `resolve.ts` — enforces exactly one bundle when any bundle recipes exist, `conflicts`/`requires`, and returns bundle-first + alphabetical-by-category-then-id ordering.
- `inject.ts` — a snippet at `inject/<targetRelPath>.inject/<markerName>.<ext>` is spliced in directly above the `// @inikitty:inject:<markerName>` (or `# ...`) marker line in the already-copied `<targetRelPath>`; `stripMarkers()` removes all leftover marker lines afterward. See `recipes/README.md` for the full convention with an example.
- `packageJson.ts` / `envVars.ts` — merge `packageJsonPatch`/`envVars` from resolved recipes in order; last recipe wins on a key collision (with a `console.warn` for package.json).
- `apply.ts` — fixed pipeline order matters: copy base → copy each recipe's `files/` (throws on collision, never silently overwrites) → apply all `inject/` → **`mergeEnvVars` before `stripMarkers`** (the `.env.example` marker must survive to be consumed) → merge `packageJsonPatch` → `{{projectName}}`/`{{projectNameKebab}}` placeholder substitution → `postInstall.ts` runners. `generate()` locates `templates/base`/`recipes` via `findPackageRoot()` (walks up from the running module's own directory until it finds a `package.json`) rather than a hardcoded relative path — this is what makes path resolution work identically whether running unbundled via `tsx` (`src/engine/apply.ts`) or from the tsup-bundled single-file `dist/cli.js`.
- Never write `{{projectName}}` directly inside a JSX expression (`{{projectName}}`) — that parses as an object-literal shorthand, not a placeholder token. Assign it to a plain-JS `const` first (see `templates/base/app/src/App.tsx`), then reference the variable with single braces.

Engine unit tests use small fixture recipes in `tests/fixtures/` (not real product recipes) so they don't churn as real recipes are added; `tests/smoke/real-template.test.ts` separately exercises the actual `templates/base` + `recipes/` — one case with no bundle selected, one with the real `prisma-betterauth-casl-stripe` + `jwt-plugin` selected (file shape and injected content only, `runPostInstall: false` since that needs Docker/network). Full behavioral verification (does signup/login/session actually work against a real Postgres) is currently manual, not automated — see `recipes/README.md`.

### Auth design decisions (apply to `prisma-betterauth-casl-stripe` and anything built on it)

- **Session model is Better Auth's native cookie-based session, not a hand-built JWT access/refresh pair.** §7.1 of the product-scope doc describes "JWT access token + refresh token" — that's the *intent* (short-lived, securely-stored credentials), not a literal mechanism to force onto the library. Don't reimplement JWT access/refresh; that's what `jwt-plugin` is for on the rare occasion something outside this API needs to verify identity without a DB round trip.
- **Auth endpoints are Better Auth's real routes** (`basePath: '/auth'` — so `POST /auth/sign-up/email`, `POST /auth/sign-in/email`, `GET /auth/get-session`, etc.), not renamed to match §7.1's illustrative `/auth/signup`/`/auth/login` literally. Don't add a wrapper controller to rename them — that's more code duplicating Better Auth's own logic for no real benefit.
- The `@thallesp/nestjs-better-auth` package registers a **global `AuthGuard`** — every route is protected by default. Anything that must stay public needs `@AllowAnonymous()` (see the `health-decorators` inject marker in `app.controller.ts` for the pattern).
- Email verification/reset use a `console.log`-based stub (`sendVerificationEmail`/`sendResetPassword` in `auth.ts`) per product-scope §13's own suggested v1 fallback — swapping in a real provider (Resend, Postmark) is future work, not a bug.

### Multi-tenancy, RBAC, and DTO conventions (apply inside generated projects)

These are hard constraints the generator must bake into every generated project, and that anyone editing recipe templates must preserve:

- Every app table carries `tenant_id`; tenant is resolved from a JWT claim (subdomain resolution is documented as an alternative, not built by default).
- Postgres RLS enforces tenant scoping at the DB level as a backstop against application-code bugs.
- The ORM layer auto-injects the tenant filter — a developer should not be able to write a query that forgets to scope by tenant. Recipe-generated code must always go through the tenant-scoped query helper, never query tables directly.
- CASL wired via a `PoliciesGuard` + `@CheckPolicies()` decorator; three seeded roles (`owner`, `admin`, `member`); abilities are tenant-aware (scoped to the user's membership/role within the active tenant, not global).
- Global `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true` — never remove this.
- Per-resource DTO convention: `CreateXDto`, `UpdateXDto` (as `PartialType(CreateXDto)`), `XResponseDto` with `@Exclude()` on sensitive fields — never return an entity directly.
- The `Projects` resource is the canonical worked example (tenant-scoped, RBAC-guarded, DTO-validated, with FE pages) that all of the above conventions should match. Treat it as the reference implementation when writing or reviewing other recipe templates.

### AI-agent readiness (applies to generated projects, not this repo)

- `AGENTS.md` at the generated project's root is the single source of truth for AI coding agents — vendor-agnostic, assembled from what the applied recipes actually wired (real commands, real conventions), not static boilerplate.
- Vendor-specific shims (`CLAUDE.md`, `.cursor/rules/`, Copilot instructions) are optional category recipes, never a default, and are always thin pointers into `AGENTS.md` — never duplicated content, to avoid drift.
- This principle (thin vendor shim → single real source of truth) is the same pattern this very file should follow once this repo's own `AGENTS.md`-equivalent exists.

## Testing strategy

Test-first at two levels:

- **Testing the generator itself**: unit tests for recipe resolution, `conflicts`/`requires` checking, marker-comment injection, and `packageJsonPatch` merging are **implemented** (`tests/unit/`, temp-dir only via `fs.mkdtemp`, no real installs), plus smoke tests against the real template + real recipes (`tests/smoke/`, file-shape/injection only). **Not yet implemented**: an *automated* e2e suite that runs `create-inikitty` into a temp dir, `pnpm install`, runs migrations against a containerized Postgres, starts the API, and hits real endpoints in CI — this has so far been done manually per recipe change (see `recipes/README.md`) and should eventually become a real CI job per §8.3/§9.1.
- **Testing generated projects**: not yet implemented — every generated project should eventually ship working unit tests (service layer, tenancy/RBAC mocked) and integration/e2e tests (via `supertest`) covering signup → login → create project → list (own tenant only) → cross-tenant access rejected → RBAC-restricted action rejected for `member`. This depends on the golden-path bundle existing.

## MVP phasing

Phase 1 is golden-path only: NestJS + Prisma + Postgres (RLS) + Better Auth + CASL + Stripe + Vite/React + shadcn/ui, single recipe, no CLI branching beyond project name. It's not "done" when the app merely runs — it requires the full generated test suite passing, `README.md`/`ARCHITECTURE.md`/`/api/docs` present and accurate, and `AGENTS.md` + `docs/adding-a-resource.md` present and reflecting real wiring (see `docs/product-scope.md` §12 for the full checklist).

For anything not covered here — exact endpoint list, full tech-stack rationale, CLI prompt flow, open questions — read [docs/product-scope.md](docs/product-scope.md) directly; it is the authoritative spec until real code exists.
