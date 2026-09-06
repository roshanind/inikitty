# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

**Phase 1 (the golden path) is functionally complete.** The generator engine, CLI, and base template are implemented; the golden-path bundle recipe (`recipes/bundle/prisma-betterauth-casl-stripe/`) wires auth (Better Auth), multi-tenancy (Postgres RLS), RBAC (CASL), billing (Stripe), Material UI, and one worked-example resource (`Projects`) end to end — plus the generated project's own test suite, `AGENTS.md`, `README.md`, and `ARCHITECTURE.md`, all real and assembled from what's actually wired, not boilerplate. There's also two optional category recipes: `auth-extra/jwt-plugin` and `ai-format/claude-code` (a thin `CLAUDE.md` pointing at `AGENTS.md`). A real CI job (`.github/workflows/ci.yml`) now runs the whole golden path — generate, install, Docker Postgres, migrations, unit + e2e tests, frontend build — on every push, matrixed to automatically cover future bundles. What's left for the broader spec (`docs/product-scope.md` §12) is Phase 2/3 scope: alternate ORM/UI-library recipes, additional vendor-agent shims (Cursor, Copilot), and Drizzle/payment-provider/monorepo alternatives.

Every piece has been **verified live**, not just via typecheck/build: a real generated project, real Postgres via Docker, real Node ≥22, real HTTP requests — signup → email verification → session → create/list/update/delete a project → cross-tenant isolation (empty list + 404, not a leak) → RBAC (a `member` gets 403 on update/delete, 200/201 on read/create) — codified as an actual automated test suite (`pnpm test` + `pnpm test:e2e`), not just a manual pass. The Stripe webhook's signature verification was checked separately with Stripe's own test-header helper (no live Stripe account needed). See `recipes/README.md` for what each recipe actually contains and a long list of non-obvious gotchas hit while building it — several of them real, previously-latent bugs that this live-verification discipline is what actually caught: a missing `esModuleInterop` that silently broke any default-imported CJS dependency; an `incremental`+`deleteOutDir` interaction that could silently emit a broken partial build; a CASL guard that was completely non-functional without an explicit `Scope.REQUEST`; a Vite/Rollup CJS-interop gap with symlinked workspace packages; CORS being incompatible with credentialed requests out of the box; a Jest limitation where ESM-only dependencies (Better Auth's own packages) can't be loaded even with a transform configured; and `app/`'s peer-dependency-variant of `better-auth` resolving a *different* copy of its internal `zod` dependency than `api/`'s, breaking `nest build` with the exact TS2742 error a much earlier pin was supposed to prevent — caught only by a genuinely clean `rm -rf node_modules && pnpm install` (an incremental reinstall on stale `node_modules` masked it). Read `recipes/README.md` before touching the recipe.

**Architecture highlights, if you need the "why" behind a specific file:**

- The bundle generates a **pnpm workspace** (root `pnpm-workspace.yaml`, `packages/shared/`) so `api/` and `app/` share CASL's ability rules isomorphically — `app/src/lib/use-ability.ts` is the payoff, driving real UI (e.g. hiding the Delete button for a `member`) off the *same* rules the API enforces. `packages/shared` ships a **dual CJS/ESM build** (`dist/cjs/` + `dist/esm/`) because a single CJS build broke Vite's production build specifically for a symlinked workspace package, even though `tsc`/`node` both consumed it fine.
- `main.ts` carries marker comments for `imports`/`middleware` (billing needs raw-body handling alongside Better Auth's own disabled-bodyParser requirement) and `app/src/App.tsx`/`main.tsx` carry marker *pairs* (`routes-open`/`routes-close`, `providers-open`/`providers-close`) so this recipe can wrap the base template's placeholder home page in real routing/provider JSX without forcing `react-router-dom`/`@tanstack/react-query`/MUI onto every generated project regardless of bundle selection.
- `AGENTS.md`/`README.md` are assembled from applied recipes via the **same marker-injection mechanism** recipes already use for source files — multiple recipes contributing to one marker (the bundle's real content, then `jwt-plugin`'s small addendum) needed zero engine changes, since `inject.ts` already applies recipes in resolution order. `ARCHITECTURE.md` has no base-template involvement at all — it's meaningless without a real stack, so it's a plain file the bundle ships directly.
- The generated project's own test suite spawns the **real compiled server** (`node dist/main.js`) for e2e tests rather than using Nest's in-process `TestingModule` — deliberately, since Better Auth's ESM-only packages break Jest's module loader the moment `AppModule` pulls them in transitively. Unit tests use a manual Jest mock instead, wired through a new, narrowly-scoped engine capability: `packageJsonPatch.jestModuleNameMapper`.
- `docs/adding-a-resource.md` lives at `recipes/bundle/prisma-betterauth-casl-stripe/files/docs/adding-a-resource.md` — inside the recipe, not this repo's own top-level `docs/` — so there's exactly one copy, and it's the one that actually ships (per `docs/product-scope.md` §11's own warning against a duplicated copy drifting out of sync).

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

There's also a separate documentation site in `docs-site/` (VitePress, its own `package.json`/lockfile — not a workspace member of the root package). `pnpm docs:dev` / `pnpm docs:build` / `pnpm docs:preview` from the repo root proxy into it. See `docs-site/README.md`.

To reproduce the CI golden-path job locally (needs Docker running and Node ≥22, same as manual verification):

```
pnpm exec tsx scripts/list-bundles.ts
pnpm exec tsx scripts/golden-path-generate.ts --bundle <id> --out <dir> --project-name "<name>"
pnpm exec tsx scripts/golden-path-post-install.ts --out <dir> --project-name "<name>"
# then, inside <dir>/api: pnpm test && pnpm build && pnpm test:e2e
# and inside <dir>/app:   pnpm exec tsc -b && pnpm exec vite build
```

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
| UI components | Material UI (MUI) (default) |
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
- **Bundle recipes** — integration-coupled choices that must be tested together as one unit (e.g. ORM + auth provider + tenancy wiring + RBAC). v1 ships exactly one bundle: `prisma-betterauth-casl-stripe`, functionally complete — see `recipes/README.md`. A second ORM means authoring a second bundle (`drizzle-betterauth-casl-stripe`), not making ORM and auth independently pluggable — that integration seam is where "loosely wired" bugs happen, so it stays a single tested unit until proven safe to split.

Engine responsibilities: discover recipes → resolve user selections into one bundle + zero-or-more category recipes (checking `conflicts`/`requires`) → apply base template then each recipe's `files/`/`inject/` in order → merge `packageJsonPatch` and install → run each recipe's `postInstall.ts` in order.

Even though v1 has only one bundle, the selection/resolution logic must be written generally from day one, and the golden-path CI check should run once per available bundle so it automatically covers future bundles.

**Implementation** (`src/engine/`, one module per responsibility — read `apply.ts` first, it's the orchestrator):
- `discover.ts` — scans `<recipesDir>/<category>/<id>/manifest.ts`. Manifests (and `postInstall.ts`) are loaded via `jiti` (`createJiti(import.meta.url)`), not a plain dynamic `import()` — recipes ship as raw, uncompiled `.ts` so authors get type safety against `RecipeManifest`, and jiti is what lets the *built* CLI (plain Node, no ts-node) load them at runtime. Don't swap this back to `import()`.
- `resolve.ts` — enforces exactly one bundle when any bundle recipes exist, `conflicts`/`requires`, and returns bundle-first + alphabetical-by-category-then-id ordering.
- `inject.ts` — a snippet at `inject/<targetRelPath>.inject/<markerName>.<ext>` is spliced in directly above the `// @inikitty:inject:<markerName>` (or `# ...`) marker line in the already-copied `<targetRelPath>`; `stripMarkers()` removes all leftover marker lines afterward. See `recipes/README.md` for the full convention with an example.
- `packageJson.ts` / `envVars.ts` — merge `packageJsonPatch`/`envVars` from resolved recipes in order; last recipe wins on a key collision (with a `console.warn` for package.json). `packageJsonPatch` also supports `jestModuleNameMapper`, merged into `package.json`'s `jest.moduleNameMapper` specifically — deliberately narrow (not a generic arbitrary-Jest-config merge, since fields like `transform` are array/tuple-shaped and can't be represented by the same flat string-record merge) but real enough to have been needed already (see the testing gotchas in `recipes/README.md`).
- `apply.ts` — fixed pipeline order matters: copy base → copy each recipe's `files/` (throws on collision, never silently overwrites) → apply all `inject/` → **`mergeEnvVars` before `stripMarkers`** (the `.env.example` marker must survive to be consumed) → merge `packageJsonPatch` → `{{projectName}}`/`{{projectNameKebab}}` placeholder substitution → `postInstall.ts` runners. `generate()` locates `templates/base`/`recipes` via `findPackageRoot()` (walks up from the running module's own directory until it finds a `package.json`) rather than a hardcoded relative path — this is what makes path resolution work identically whether running unbundled via `tsx` (`src/engine/apply.ts`) or from the tsup-bundled single-file `dist/cli.js`.
- Never write `{{projectName}}` directly inside a JSX expression (`{{projectName}}`) — that parses as an object-literal shorthand, not a placeholder token. Assign it to a plain-JS `const` first (see `templates/base/app/src/App.tsx`), then reference the variable with single braces.

Engine unit tests use small fixture recipes in `tests/fixtures/` (not real product recipes) so they don't churn as real recipes are added; `tests/smoke/real-template.test.ts` separately exercises the actual `templates/base` + `recipes/` — one case with no bundle selected, one with the real `prisma-betterauth-casl-stripe` + `jwt-plugin` selected (file shape and injected content only, `runPostInstall: false` since that needs Docker/network). Full behavioral verification (does signup/login/session actually work against a real Postgres) has been done manually, thoroughly, more than once as the bundle grew — but is still not automated/CI — see `recipes/README.md`.

### Auth design decisions (apply to `prisma-betterauth-casl-stripe` and anything built on it)

- **Session model is Better Auth's native cookie-based session, not a hand-built JWT access/refresh pair.** §7.1 of the product-scope doc describes "JWT access token + refresh token" — that's the *intent* (short-lived, securely-stored credentials), not a literal mechanism to force onto the library. Don't reimplement JWT access/refresh; that's what `jwt-plugin` is for on the rare occasion something outside this API needs to verify identity without a DB round trip.
- **Auth endpoints are Better Auth's real routes** (`basePath: '/auth'` — so `POST /auth/sign-up/email`, `POST /auth/sign-in/email`, `GET /auth/get-session`, etc.), not renamed to match §7.1's illustrative `/auth/signup`/`/auth/login` literally. Don't add a wrapper controller to rename them — that's more code duplicating Better Auth's own logic for no real benefit.
- The `@thallesp/nestjs-better-auth` package registers a **global `AuthGuard`** — every route is protected by default. Anything that must stay public needs `@AllowAnonymous()` (see the `health-decorators` inject marker in `app.controller.ts` for the pattern).
- Email verification/reset use a `console.log`-based stub (`sendVerificationEmail`/`sendResetPassword` in `auth.ts`) per product-scope §13's own suggested v1 fallback — swapping in a real provider (Resend, Postmark) is future work, not a bug.

### Tenancy design decisions (apply to `prisma-betterauth-casl-stripe` and anything built on it)

- **Tenant resolution is dynamic, not a stored JWT claim.** §7.2 says "JWT claim carries the active tenant_id" — same reinterpretation as the session-model decision above: there's no raw JWT to carry a claim in. `TenantContext` (`src/tenancy/tenant-context.ts`, request-scoped) resolves the tenant per request via `Membership.findFirst({ where: { userId } })`. **Known gap**: a user in more than one tenant always resolves to their oldest membership — switching between multiple memberships isn't built.
- **`Membership.userId` has no Prisma `@relation` to `User`.** Prisma requires a relation declared on both sides, but `User` is fully owned/overwritten by `npx auth generate` on every run — a hand-added back-relation field there would vanish on the next regenerate. Real referential integrity is a raw-SQL Postgres FK instead (in `enable-rls.sql`), not a Prisma relation. Query by the plain `userId` column; don't try to `include: { user: true }`.
- **RLS requires the app to connect as a non-superuser role.** Postgres superusers unconditionally bypass row-level security. The runtime app (PrismaService, `auth.ts`'s own client) connects via `APP_DATABASE_URL` as the limited `app_role`; `DATABASE_URL` (superuser) is migration-only. Any new runtime DB access must use `APP_DATABASE_URL`, never `DATABASE_URL`, or RLS silently does nothing for it.
- **Tenant scoping is a Prisma Client Extension, not manual `where: { tenantId }` clauses.** `forTenant(tenantId)` (`src/tenancy/tenant.extension.ts`) wraps every query in a transaction that sets the Postgres session variable RLS policies check. `TenantContext.getPrisma()` returns the scoped client — future resources (`Projects`) should inject `TenantContext` and query through it, never the plain `PrismaService`, for tenant-scoped tables.
- **The `membership` RLS policy has two branches on purpose.** `USING` (read side) allows a row when `tenantId` matches the active tenant *or* `userId` matches the active user — that second branch exists only so `TenantContext` can look up "which tenant do I belong to" before a tenant is known (via a separate `forUser()` extension). `WITH CHECK` (write side) only has the tenant branch. Don't use `forUser()` for anything except that one self-lookup.
- **RLS DDL ships as a real, tracked migration, not `prisma db execute`.** `ENABLE ROW LEVEL SECURITY`/`CREATE POLICY`/`CREATE ROLE` aren't expressible in `schema.prisma`; `postInstall.ts` writes `enable-rls.sql`'s contents into a freshly-timestamped `prisma/migrations/<now>_enable_rls/` folder (after `init`, so it applies second) and runs `prisma migrate deploy`.

### Billing design decisions (apply to `prisma-betterauth-casl-stripe` and anything built on it)

- **Hosted Checkout and Customer Portal, not embedded/client-side Stripe.js.** §7.4 asks for a "Checkout session creation endpoint" and "Customer portal redirect endpoint" — both read as server-side session creation + redirect, not an embedded payment form. `POST /billing/checkout`/`POST /billing/portal` return `{ url }` for the frontend to redirect to; there's no `@stripe/stripe-js` dependency anywhere, and no billing FE pages (unlike `Projects`, §7.4 doesn't ask for FE pages the way §7.6 explicitly does for `Projects`).
- **The webhook resolves `tenantId` from Stripe event metadata, never a DB lookup.** There's no authenticated request when Stripe calls the webhook, so nothing like `TenantContext` is available. `createCheckoutSession` stamps `tenantId` into `subscription_data.metadata` at session-creation time (a real tenant-scoped request); every later `customer.subscription.*` event carries that same metadata on the Subscription object, so the webhook reads it straight off the payload and calls `forTenant(tenantId)` directly — the same "known tenant, no request context" pattern `auth.ts`'s signup hook already uses for its first `membership` insert.
- **`subscription`'s RLS policy has only one `USING` branch, unlike `membership`'s two.** `membership` needs a `forUser()` escape hatch because `TenantContext` must read it *before* a tenant is known. `subscription` never has that problem (see above), so both `USING` and `WITH CHECK` only check the tenant.
- **Billing endpoints are owner-only via CASL, not a separate ad hoc check.** `Subscription` was added to the shared `Subjects` union specifically for this; only `owner`'s `can(Action.Manage, 'all')` wildcard grants it — `admin`/`member` get nothing added for `Subscription`, so they're denied by omission, not an explicit `cannot()` rule.
- **One `Subscription` row per tenant** (`Subscription.tenantId` is `@unique`), matching §7.4's singular "a `Subscription` table" — v1 doesn't support multiple concurrent plans/add-ons per tenant.

### Projects design decisions (apply to `prisma-betterauth-casl-stripe` and anything built on it)

- **`PoliciesGuard` must be `@Injectable({ scope: Scope.REQUEST })`, not the plain default scope** — this was a real, live bug caught only once `Projects` gave CASL an actual route to guard: without it, Nest instantiates the guard once at bootstrap (before any request exists), so its request-scoped `TenantContext` dependency never resolves — every field on the guard comes back `undefined` at request time, not a DI error at startup, so it fails as a silent 500 on literally every `@CheckPolicies()`-guarded route. Any future globally-registered enhancer (`APP_GUARD`/`APP_INTERCEPTOR`/`APP_FILTER`) that depends on a request-scoped provider needs the same explicit scope annotation — Nest's usual "scope bubbles up automatically" behavior does not reliably extend to global enhancers.
- **The FE's `useAbility()` hook calls the literal same `defineAbilityFor()` the API's guard uses**, fed by `GET /tenants/me`'s role — not a separately hand-maintained FE permission table. This is the actual payoff of putting CASL's rules in `packages/shared` back in the CASL slice.
- **`app/src/App.tsx` and `main.tsx` gained marker *pairs*** (`routes-open`/`routes-close`, `providers-open`/`providers-close`), not single markers — the existing single-marker convention only supports pure insertion, but wrapping the base template's placeholder home page in real `<Routes>`/provider JSX needs content both before *and* after it. A recipe's `routes-open` snippet ends mid-expression (`<Route path="/" element={`) and `routes-close` closes it (`} /></Routes>`) — the base placeholder ends up as the `element` value for the `/` route, completely unmodified, so the no-bundle case still renders exactly what it always did.
- **`GET /auth/get-session` (what `useSession()` polls) returns the literal JSON value `null`, not `undefined` or an empty object, when there's no session** — verified against a real response, not assumed from the client library's types. `RequireAuth` checks `!data`, not `!data?.session`.
- **Signup doesn't yield a usable session immediately** — `requireEmailVerification: true` (set in the auth slice) means the session from `POST /auth/sign-up/email` can't authenticate anything until the verification link is visited; since email delivery is a `console.log` stub, `SignupPage` shows an explicit "check the API's console" message rather than silently redirecting to a login that would just fail.

### UI design decisions (apply to `prisma-betterauth-casl-stripe` and anything built on it)

- **MUI is baked directly into the bundle's own FE pages, not a separate pluggable category recipe** — per `docs/product-scope.md` §12, a UI library *choice* (Antd, shadcn/ui as alternates) is explicitly Phase 2 scope; Phase 1 bakes in exactly one default. This means `LoginPage`/`SignupPage`/`ProjectsListPage`/`ProjectDetailPage`/`RequireAuth` all import MUI components directly, and `app/package.json` gets `@mui/material`/`@emotion/react`/`@emotion/styled` unconditionally whenever this bundle is selected — there's no world where the bundle is selected and MUI isn't. If a real "UI library choice" prompt is ever built (Phase 2), expect this to require restructuring these page files, not just adding a sibling recipe alongside an unstyled version — there was never an unstyled version to begin with.
- **`ThemeProvider`/`CssBaseline` are wired into `main.tsx`'s existing `providers-open`/`providers-close` markers** (added by the earlier Projects slice for `QueryClientProvider`/`BrowserRouter`) — no new markers were needed, since this is the same recipe extending its own previously-added wrap point. `ThemeProvider` is the outermost wrap so theme context reaches everything, including the base template's own unstyled placeholder home page (which still renders as plain HTML — only this bundle's own injected `home-links` nav actually uses MUI components).
- **The base template's `app/` has zero UI-library dependency of its own** — the "no bundle selected" case never installs MUI, matching the recipe/bundle system's own rule that the engine (and by extension the base template) must never hardcode knowledge of a specific tool.

### Multi-tenancy, RBAC, and DTO conventions (apply inside generated projects)

These are hard constraints the generator must bake into every generated project, and that anyone editing recipe templates must preserve:

- Every tenant-scoped app table carries a `tenant_id`-equivalent column (`Membership.tenantId` was the first; `Subscription.tenantId` and `Project.tenantId` followed — `Tenant` itself doesn't have one, it's the scope boundary, not scoped data).
- Postgres RLS enforces tenant scoping at the DB level as a backstop against application-code bugs — **implemented and live-verified** for `membership` (connecting as `app_role` directly, confirming cross-tenant reads return zero rows) and for `project` (a full two-tenant HTTP test: tenant B's project list comes back empty, and requesting tenant A's project id directly by id returns a 404, not a leak). `subscription` shares the identical single-branch policy shape as `project` but wasn't separately live-tested (no Stripe account in this environment) — see the billing gotchas in `recipes/README.md` for why its policy only needs one `USING` branch, unlike membership's two.
- The ORM layer auto-injects the tenant filter via a Prisma Client Extension (`forTenant()`) — a developer should not be able to write a query that forgets to scope by tenant. Recipe-generated code must always go through `TenantContext`'s scoped client (or `forTenant(tenantId)` directly when no request-scoped context exists, e.g. the Stripe webhook or the signup hook), never query tenant-scoped tables directly with the plain `PrismaService`.
- CASL wired via a `PoliciesGuard` + `@CheckPolicies()` decorator, registered globally alongside Better Auth's `AuthGuard` (`api/src/casl/`); three seeded roles (`owner`, `admin`, `member` — the `MembershipRole` enum exists and is seeded on signup). Ability definitions (`defineAbilityFor()`) live in the `packages/shared` workspace package, not `api/`, so the same rules are importable from `app/` too — tenant-aware by construction, since callers always pass the role the user holds *within the active tenant* (`TenantContext.getRole()`), never a global role. `Subjects` covers `Tenant`/`Membership`/`Project`/`Subscription`. `ProjectsController` is the first controller guarding a real business resource, and enforcement is **live-verified**: a `member` gets a real 403 on `PATCH`/`DELETE` and a real 200/201 on `GET`/`POST`, exactly matching `defineAbilityFor()`'s rules.
- Global `ValidationPipe` with `whitelist: true, forbidNonWhitelisted: true` — never remove this.
- Per-resource DTO convention: `CreateXDto`, `UpdateXDto` (as `PartialType(CreateXDto)`), `XResponseDto` with `@Exclude()` on sensitive fields — never return an entity directly. **Now formally established**, via `Project`'s DTOs (`api/src/projects/dto/`) — `ProjectResponseDto` uses class-level `@Exclude()` + per-field `@Expose()` (deny-by-default, safer than marking individual sensitive fields) and is served through a newly-added global `ClassSerializerInterceptor` (`main.ts`, base template — generic infrastructure, not gated behind any recipe). Verified live: `tenantId` never appears in a `Project` API response even though the Prisma model has it.
- `Project` (**built**) is the canonical worked example — tenant-scoped, RBAC-guarded, DTO-validated, with FE list/create/detail pages, all live-verified end to end. See `docs/adding-a-resource.md` for the walkthrough and `recipes/README.md`'s Projects gotchas for what broke along the way. Treat it as the reference implementation when writing or reviewing other recipe templates.

### AI-agent readiness (applies to generated projects, not this repo)

- **`AGENTS.md` at the generated project's root is implemented.** `templates/base/AGENTS.md` ships a generic skeleton (what the project is, real `api/`/`app/` commands, a trailing generic guardrails section) with one marker, `<!-- @inikitty:inject:agents-sections -->`; `recipes/bundle/prisma-betterauth-casl-stripe/inject/AGENTS.md.inject/agents-sections.md` supplies the real content (the tenancy rule as a hard constraint, the RBAC convention with a real `Projects` example, the DTO convention, directory responsibilities, migration/test commands, stack-specific guardrails) and `auth-extra/jwt-plugin` contributes its own small addendum to the *same* marker. This needed **zero engine changes** — multiple recipes targeting one marker was already supported by `inject.ts`'s existing "recipes applied later land below recipes applied earlier, both above the marker" behavior; nobody had exercised that with more than one recipe on the same file before. One real gotcha: consecutive snippets concatenate with no blank line by default (`applyInjections` strips each snippet's *trailing* newlines, so two snippets touching the same marker butt up against each other) — fixed by giving `jwt-plugin`'s snippet a **leading** blank line, which survives the strip (`/\n+$/` only matches the end) and separates it from whatever the bundle already inserted above it.
- **`docs/adding-a-resource.md` moved from this repo's own top-level `docs/` into `recipes/bundle/prisma-betterauth-casl-stripe/files/docs/adding-a-resource.md`** — it was written during the Projects slice but never actually copied into generated projects, so `AGENTS.md` couldn't honestly point at it as real. There is now exactly one copy, and it's the one that ships (matches §11's own warning against a duplicated copy drifting out of sync) — don't recreate a second copy at the old path.
- Vendor-specific shims (`CLAUDE.md`, `.cursor/rules/`, Copilot instructions) are optional category recipes, never a default, and are always thin pointers into `AGENTS.md` — never duplicated content, to avoid drift. **`ai-format/claude-code` is built** (the one working shim §12 asks for, to validate the category mechanism end-to-end): a `CLAUDE.md` containing only a pointer to `AGENTS.md`, no real content of its own. No other vendor shims (Cursor, Copilot, ...) exist yet — reasonable to add later following the identical pattern.
- This principle (thin vendor shim → single real source of truth) is the same pattern this very file should follow once this repo's own `AGENTS.md`-equivalent exists.

## Testing strategy

Test-first at two levels:

- **Testing the generator itself**: unit tests for recipe resolution, `conflicts`/`requires` checking, marker-comment injection, and `packageJsonPatch` merging are **implemented** (`tests/unit/`, temp-dir only via `fs.mkdtemp`, no real installs), plus smoke tests against the real template + real recipes (`tests/smoke/`, file-shape/injection only). An *automated* golden-path e2e job now also **runs in CI** (`.github/workflows/ci.yml`) — see below.
- **Testing generated projects**: **implemented**. Base template ships Jest (unit tests co-located under `src/`, plus a separate `test/jest-e2e.js` config for `*.e2e-spec.ts` files) and a trivial reference spec for each (`app.controller.spec.ts`, `test/app.e2e-spec.ts`). The golden-path bundle adds `ProjectsService`'s unit test (tenancy mocked, the `docs/adding-a-resource.md` reference) and `test/golden-path.e2e-spec.ts`, which automates the exact flow that used to be manual-only: signup → login → create project → list (own tenant only) → cross-tenant access rejected → RBAC-restricted action rejected for `member`.

**CI (`.github/workflows/ci.yml`) is implemented** — three jobs: `generator` (typecheck/lint/test/build, fast, no Docker), `discover-bundles` (runs `scripts/list-bundles.ts`, which calls `discoverRecipes()` and filters for `category === 'bundle'`, to build a matrix), and `golden-path` (matrixed over that output — v1 has exactly one bundle, but a second one is covered automatically with zero workflow changes, per this file's own "the golden-path CI check should run once per available bundle" requirement above). The `golden-path` job mirrors a real `npx create-inikitty` run exactly, via two small scripts rather than reimplementing generation/install/postInstall logic in YAML:

- `scripts/golden-path-generate.ts` — calls `generate()`, copies `.env.example` to `api/.env`, then installs deps the same way `src/cli.ts` does (single root `pnpm install` when the bundle wrote a `pnpm-workspace.yaml`, otherwise separate `api/`/`app/` installs). Writes `<out>/.inikitty-ci-recipes.json` (the resolved `DiscoveredRecipe[]`, safe to round-trip through JSON since it's plain data) for the next step.
- `scripts/golden-path-post-install.ts` — reads that JSON and calls `runPostInstalls()`, which runs each recipe's real `postInstall.ts` (builds `packages/shared`, `docker compose up -d` using the recipe's own generated `docker-compose.yml` — GitHub-hosted runners ship Docker + the Compose v2 plugin, so this is the actual recipe's setup path, not a CI-specific approximation of it — then the Prisma/Better-Auth/RLS migration sequence).

After that, the job runs `pnpm test` (unit), `pnpm build`, `pnpm test:e2e` (the real black-box e2e suite), and `app/`'s `tsc -b` + `vite build` — the exact sequence verified by hand throughout this project's development, now automated. Verified two ways before considering it done: locally (running both scripts + every downstream step directly, not just reading the YAML), and — the only real test for a workflow file — a real push, watched via `gh run watch`, where all three jobs passed on GitHub's actual runners (`golden-path` in ~75s). The first push's workflow file had a real bug `actionlint` (not caught by local script testing, since it's a workflow-syntax-level issue) found immediately: `${{ runner.temp }}` isn't a valid context in a job-level `env:` block — fixed by using a plain literal path instead (each matrix job gets its own isolated VM, so a fixed `/tmp` path is safe).

## MVP phasing

**Phase 1 is done.** Golden path: NestJS + Prisma + Postgres (RLS) + Better Auth + CASL + Stripe + Vite/React + MUI, single recipe, no CLI branching beyond project name. Every item on the doneness checklist (`docs/product-scope.md` §12) is real, not placeholder text: the full generated test suite passes (unit + e2e, live-verified against real Postgres); `README.md`, `ARCHITECTURE.md`, and `/api/docs` (Swagger) are present and accurate; `AGENTS.md` and `docs/adding-a-resource.md` reflect the actual wiring, assembled from applied recipes rather than static boilerplate. MUI is baked directly into the bundle's own FE pages (not a separate pluggable recipe — per §12, a UI-library *choice* is explicitly Phase 2 scope; Phase 1 bakes in one default). No vendor-specific AI-agent shim recipe (Claude Code, Cursor, etc.) exists yet — §12 asks for "at least one working shim recipe... to validate the category mechanism end-to-end," which is the one item on the Phase 1 checklist not yet built.

Phase 2/3 (not started): Drizzle as an alternate ORM recipe; Antd/shadcn-ui as alternate UI-library recipes; payment-provider alternatives; a monorepo toggle; subdomain-based tenant resolution. (The §8.3/§9.1 "generate → install → migrate → test" verification loop is done — see the Testing strategy section above and `.github/workflows/ci.yml`.)

For anything not covered here — exact endpoint list, full tech-stack rationale, CLI prompt flow, open questions — read [docs/product-scope.md](docs/product-scope.md) directly; it is the authoritative spec until real code exists.
