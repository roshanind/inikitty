# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

The **generator engine, CLI, and base template are implemented** (the "foundation pass" — see git history / `docs/product-scope.md`). What does **not** exist yet: any real recipes. `recipes/` currently only has a `README.md` documenting the contract; there is no Prisma/Better Auth/CASL/Stripe bundle, no `Projects` example resource, no `AGENTS.md` generation, and no README/ARCHITECTURE.md assembly. Running `create-inikitty` today generates just the bare, unwired NestJS + Vite/React skeleton in `templates/base/`. Building the golden-path bundle recipe is the next major piece of work — see `docs/product-scope.md` §6–§7 for what it needs to contain.

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

The CLI (`src/cli.ts`) is an interactive `@clack/prompts` TUI — it does not work with piped/non-TTY stdin, so don't try to script it with `printf ... | node dist/cli.js` for verification. To exercise generation programmatically (e.g. for manual smoke checks), import `generate` from `src/index.ts` / `dist/index.js` directly and call it with an explicit `selection`, as the tests do.

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

- **Category recipes** — independent choices (e.g. UI library) that can be freely mixed with any other category recipe.
- **Bundle recipes** — integration-coupled choices that must be tested together as one unit (e.g. ORM + auth provider + tenancy wiring + RBAC). v1 ships exactly one bundle: `prisma-betterauth-casl-stripe`. A second ORM means authoring a second bundle (`drizzle-betterauth-casl-stripe`), not making ORM and auth independently pluggable — that integration seam is where "loosely wired" bugs happen, so it stays a single tested unit until proven safe to split.

Engine responsibilities: discover recipes → resolve user selections into one bundle + zero-or-more category recipes (checking `conflicts`/`requires`) → apply base template then each recipe's `files/`/`inject/` in order → merge `packageJsonPatch` and install → run each recipe's `postInstall.ts` in order.

Even though v1 has only one bundle, the selection/resolution logic must be written generally from day one, and the golden-path CI check should run once per available bundle so it automatically covers future bundles.

**Implementation** (`src/engine/`, one module per responsibility — read `apply.ts` first, it's the orchestrator):
- `discover.ts` — scans `<recipesDir>/<category>/<id>/manifest.ts`. Manifests (and `postInstall.ts`) are loaded via `jiti` (`createJiti(import.meta.url)`), not a plain dynamic `import()` — recipes ship as raw, uncompiled `.ts` so authors get type safety against `RecipeManifest`, and jiti is what lets the *built* CLI (plain Node, no ts-node) load them at runtime. Don't swap this back to `import()`.
- `resolve.ts` — enforces exactly one bundle when any bundle recipes exist, `conflicts`/`requires`, and returns bundle-first + alphabetical-by-category-then-id ordering.
- `inject.ts` — a snippet at `inject/<targetRelPath>.inject/<markerName>.<ext>` is spliced in directly above the `// @inikitty:inject:<markerName>` (or `# ...`) marker line in the already-copied `<targetRelPath>`; `stripMarkers()` removes all leftover marker lines afterward. See `recipes/README.md` for the full convention with an example.
- `packageJson.ts` / `envVars.ts` — merge `packageJsonPatch`/`envVars` from resolved recipes in order; last recipe wins on a key collision (with a `console.warn` for package.json).
- `apply.ts` — fixed pipeline order matters: copy base → copy each recipe's `files/` (throws on collision, never silently overwrites) → apply all `inject/` → **`mergeEnvVars` before `stripMarkers`** (the `.env.example` marker must survive to be consumed) → merge `packageJsonPatch` → `{{projectName}}`/`{{projectNameKebab}}` placeholder substitution → `postInstall.ts` runners. `generate()` locates `templates/base`/`recipes` via `findPackageRoot()` (walks up from the running module's own directory until it finds a `package.json`) rather than a hardcoded relative path — this is what makes path resolution work identically whether running unbundled via `tsx` (`src/engine/apply.ts`) or from the tsup-bundled single-file `dist/cli.js`.
- Never write `{{projectName}}` directly inside a JSX expression (`{{projectName}}`) — that parses as an object-literal shorthand, not a placeholder token. Assign it to a plain-JS `const` first (see `templates/base/app/src/App.tsx`), then reference the variable with single braces.

Engine unit tests use small fixture recipes in `tests/fixtures/` (not real product recipes) so they don't churn as real recipes are added; `tests/smoke/real-template.test.ts` separately exercises the actual `templates/base` + `recipes/`.

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

- **Testing the generator itself**: unit tests for recipe resolution, `conflicts`/`requires` checking, marker-comment injection, and `packageJsonPatch` merging are **implemented** (`tests/unit/`, temp-dir only via `fs.mkdtemp`, no real installs), plus a smoke test against the real template (`tests/smoke/`). **Not yet implemented**: e2e tests that actually run `create-inikitty` per bundle into a temp dir, `npm install`, run migrations against a containerized Postgres, start the API, and hit `/auth/signup`, `/auth/login`, `/projects` — this needs a real bundle recipe to exist first.
- **Testing generated projects**: not yet implemented — every generated project should eventually ship working unit tests (service layer, tenancy/RBAC mocked) and integration/e2e tests (via `supertest`) covering signup → login → create project → list (own tenant only) → cross-tenant access rejected → RBAC-restricted action rejected for `member`. This depends on the golden-path bundle existing.

## MVP phasing

Phase 1 is golden-path only: NestJS + Prisma + Postgres (RLS) + Better Auth + CASL + Stripe + Vite/React + shadcn/ui, single recipe, no CLI branching beyond project name. It's not "done" when the app merely runs — it requires the full generated test suite passing, `README.md`/`ARCHITECTURE.md`/`/api/docs` present and accurate, and `AGENTS.md` + `docs/adding-a-resource.md` present and reflecting real wiring (see `docs/product-scope.md` §12 for the full checklist).

For anything not covered here — exact endpoint list, full tech-stack rationale, CLI prompt flow, open questions — read [docs/product-scope.md](docs/product-scope.md) directly; it is the authoritative spec until real code exists.
