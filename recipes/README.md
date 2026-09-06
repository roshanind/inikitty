# Recipes

- **`bundle/prisma-betterauth-casl-stripe`** — the v1 golden-path bundle, **functionally complete**.
  Implements the auth + Prisma slice (Postgres via Docker Compose, Prisma with the driver-adapter
  pattern, Better Auth wired into NestJS via `@thallesp/nestjs-better-auth`, email+password with a
  console-log email stub, a global `AuthGuard`, `@CurrentUser()`), multi-tenancy (`Tenant`/
  `Membership` models, auto-provisioning on signup, a request-scoped `TenantContext`, and real
  Postgres row-level security — see the tenancy gotchas below), CASL RBAC enforcement (a global
  `PoliciesGuard` + `@CheckPolicies()` decorator in `api/src/casl/`, backed by tenant-aware ability
  definitions in the `packages/shared` workspace package so `app/` can import the same rules — see
  the CASL gotchas below), Stripe billing (`api/src/billing/`: `POST /billing/checkout` and
  `POST /billing/portal` — both owner-only via `@CheckPolicies()` — plus a public, signature-verified
  `POST /billing/webhook` that syncs a `Subscription` table, and a `@RequiresActiveSubscription()`
  guard for gating premium routes — see the billing gotchas below), the `Projects` example
  resource (`api/src/projects/` + `app/src/features/projects/`: tenant-scoped, RBAC-guarded,
  DTO-validated CRUD with FE list/create/detail pages — see the Projects gotchas below and
  `docs/adding-a-resource.md` for the full worked-example walkthrough), and Material UI (all FE
  pages built with real MUI components, not raw HTML — see the UI gotchas below for why this is
  baked into the bundle rather than a separate pluggable recipe).

  Everything above has been **verified live**, not just via generation/typecheck/build: a real
  generated project, installed for real, migrated against a real Dockerized Postgres, started with
  real Node ≥22, driven with real HTTP requests — signup, email verification (via the console-log
  stub link), session cookie, `GET /tenants/me`, full `Project` CRUD, a second tenant confirming
  cross-tenant isolation (empty list + 404 on direct access, not a leak), and a role downgraded to
  `member` via direct SQL confirming CASL actually rejects `PATCH`/`DELETE` while still allowing
  `GET`/`POST`. The Stripe webhook's signature verification was checked separately with Stripe's
  own test-header helper (`generateTestHeaderString`/`constructEvent`) — no live Stripe account was
  used or is needed for that. What's *not* verified this way: interactive browser behavior (React
  rendering, client-side routing, form submission) — no browser-automation tooling was available in
  the environment this was built in; the FE was verified via real `tsc`/`vite build` (dev and
  production) and by fetching the dev server's actual served/transformed modules, not by driving a
  real DOM.

  That manual flow is now also a **real, automated test suite** shipped with every generated
  project: `api/src/projects/projects.service.spec.ts` (unit, tenancy mocked) and
  `api/test/golden-path.e2e-spec.ts` (e2e — spawns the real compiled server, drives the exact
  signup → CRUD → cross-tenant → RBAC flow above over real HTTP against a real Postgres). See the
  testing gotchas below for what building this uncovered — several more real, previously-latent
  bugs, on top of the ones already listed for each earlier slice.
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

## Gotchas hit while adding tenancy (multi-tenancy + Postgres RLS)

- **You can't hand-extend a model that `auth generate` owns.** Prisma requires a relation to be
  declared on *both* sides (`Membership.user User @relation(...)` needs a matching
  `memberships Membership[]` on `User`), but `User` gets fully overwritten every time `auth
  generate` runs — any hand-added field there is gone on the next run. Fix: `Membership.userId` is
  a plain scalar column with no Prisma `@relation` to `User` at all; a real Postgres FK constraint
  is added instead via raw SQL in the RLS migration, so referential integrity is still enforced at
  the DB level, just not through Prisma's relation API. Query by the plain `userId` column instead
  of `include: { user: true }`.
- **Models placed above the `auth generate` marker comment in `schema.prisma` do survive
  re-generation** — verified empirically (add a throwaway model, run `auth generate --yes` again,
  confirm it's untouched) before building anything on top of that assumption. Don't assume this for
  a different marker/tool combination without checking the same way.
- **Multi-file Prisma schemas (`prismaSchemaFolder`) looked like a cleaner way to keep
  tenancy models separate from the auth-generated ones, but there are open bugs specifically about
  Better Auth's CLI generator not handling that mode correctly.** Stayed with one `schema.prisma`.
- **Postgres superusers unconditionally bypass row-level security — `FORCE ROW LEVEL SECURITY`
  does not override that.** The app previously connected as the `postgres` superuser everywhere
  (same credential for migrations and runtime). RLS needs a second, non-superuser role
  (`app_role`) that the *runtime* app connects as (`APP_DATABASE_URL`); `DATABASE_URL` (superuser)
  stays migration-only. Skipping this ships RLS policies that silently do nothing.
- **Resolving *which* tenant a request belongs to requires reading `membership` before a tenant id
  is known — a chicken-and-egg problem for a `tenant_id`-only RLS policy.** The policy has a second
  `USING` branch keyed on `app.current_user_id` (set via a separate `forUser()` extension) purely
  for this self-lookup; every other query uses `forTenant()`/`app.current_tenant_id`. `WITH CHECK`
  (governing writes) only has the tenant branch — every write, including the signup
  auto-provisioning hook's own membership insert, goes through an established tenant context.
- **RLS DDL (`ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`, `CREATE ROLE`) isn't expressible in
  `schema.prisma`,** so it can't come from a `migrate dev` schema diff. `postInstall.ts` writes it
  into a *real, timestamped* migration folder (created after `init`, so it sorts and applies
  second) and runs `prisma migrate deploy` — tracked in `_prisma_migrations`, replays correctly in
  any environment. An untracked one-off `prisma db execute` would not survive a fresh `migrate
  deploy` elsewhere (e.g. a new environment).
- **Verify RLS enforcement by actually connecting as the restricted role**, not just by reading the
  policy SQL: `docker compose exec postgres psql -U app_role -d <db>` with no session variable set
  should return zero rows from `membership`, not an error and not other tenants' data. That's the
  proof the design's safety property (fails closed, not open) actually holds.

## Gotchas hit while adding CASL RBAC

- **§6 calls CASL "isomorphic, shared FE+BE rules," but `api/` and `app/` are two independently
  installed packages with no monorepo link between them** — no root `package.json` or
  `pnpm-workspace.yaml` existed before this slice. Rather than duplicating the ability-definition
  file into both trees (drifts on hand-edits) or skipping FE sharing entirely (defers "isomorphic"
  indefinitely), the recipe now writes a root `pnpm-workspace.yaml` plus a real `packages/shared`
  workspace package holding the CASL action/subject vocabulary and `defineAbilityFor()`; both
  `api/` and `app/` depend on it via `workspace:*`. This is the first bundle file to land outside
  `api/`/`app/` at the output root — `apply.ts`'s `copyTree` already supports writing anywhere in
  the output tree, so no engine change was needed for the file itself.
- **A `workspace:*` dependency needs one install at the workspace root, not two separate
  per-package installs.** `src/cli.ts` previously ran `pnpm install` in `api/` then `app/`
  independently (there was no workspace before). It now checks for a root `pnpm-workspace.yaml`
  and, when present, installs once at the output root instead — otherwise `app/`'s
  `casl-verify-app-shared` (or equivalent) dependency can't resolve. Falls back to the old
  two-install behavior when no recipe has written a workspace file, so the CLI stays decoupled from
  knowing this is CASL's doing specifically.
- **The shared package can't import the Prisma-generated `MembershipRole` type** — same
  `auth generate`-ownership problem as the `Membership.userId` relation (see the tenancy gotchas):
  `packages/shared` has no dependency on `api/`'s generated Prisma client at all, and even if it
  did, that client doesn't exist until `postInstall.ts` runs. `packages/shared` instead declares
  its own literal union (`'owner' | 'admin' | 'member'`) that happens to be structurally identical
  to Prisma's generated type, so `TenantContext.getRole()`'s return value passes into
  `defineAbilityFor()` with no cast — verified by a real `tsc --noEmit` against a generated project
  (no Prisma-client-shaped errors leaked into the CASL code paths).
- **`packages/shared` ships compiled output, not raw TypeScript, to avoid `tsc`'s `rootDir`
  restriction.** `api/`'s and `app/`'s own compilers only accept input files under their own
  `rootDir`/`include`; a workspace package's `.ts` source living elsewhere isn't a same-project
  input. `packages/shared` has its own minimal `tsc` build (`CommonJS` output, so `api/`'s NestJS
  CommonJS build needs no interop, and Vite/esbuild's standard CJS-from-ESM interop handles the
  `app/` side) and ships `dist/`+`.d.ts` like any normal npm package. `postInstall.ts` runs
  `pnpm run build` in `packages/shared` right after install, before the Postgres/migration steps,
  since `api/`'s and `app/`'s own dev/build commands don't build their workspace dependencies for
  you (there's no Turborepo-style task graph — Turborepo is optional and prompt-gated, so the
  golden path can't rely on it).
- **`api/` and `app/` both need `@casl/ability` as a direct dependency, not just `packages/shared`**
  — same pnpm strict/isolated `node_modules` reasoning already hit for `zod` and
  `@prisma/client-runtime-utils`: type-checking code that imports `AppAbility`/`PolicyHandler` from
  `packages/shared` needs `@casl/ability`'s own types resolvable, which pnpm won't do transitively.
- **Verified by generation + a real `pnpm install` + `tsc`/`vite build` in a temp output
  directory** (Docker/Postgres not required for this slice, unlike the tenancy verification below)
  — confirmed the workspace `packages/shared` symlink resolves from both `api/`'s and `app/`'s
  `node_modules`, `packages/shared`'s own `tsc` build produces `dist/`, and both consuming packages
  typecheck (`app/` additionally bundled cleanly via `vite build`) with zero errors attributable to
  CASL/the shared package specifically.

## Gotchas hit while adding Stripe billing

- **`bodyParser: false` (needed globally for Better Auth) means *no* route gets a parsed JSON body
  by default — including the new billing endpoints.** This had gone unnoticed until now because
  every existing non-auth endpoint (`GET /tenants/me`, `GET /health`) was read-only. `main.ts`
  gained two new marker comments (`@inikitty:inject:imports` at the top, `@inikitty:inject:middleware`
  right after `NestFactory.create()`) so this recipe can restore `express.json()` for everything
  except `/auth/*` (Better Auth reads the raw stream itself) and `/billing/webhook` (Stripe's
  signature check needs the *raw* body specifically, so that path gets `express.raw()` instead).
  Any future recipe adding another endpoint that needs its own special body handling should extend
  this same middleware function rather than adding a third competing one.
- **The `stripe` npm package's pinned "latest" guess (`^19.4.0`) turned out to not exist** — the
  same "verify the resolved version after a real `pnpm install`" lesson from the auth+Prisma slice
  (see above), caught the same way: a real `pnpm install` against the generated project failed
  immediately with `ERR_PNPM_NO_MATCHING_VERSION` and printed the actual latest (`22.6.1`), which
  is what's pinned now.
- **Stripe's TS types want `constructEvent`'s payload as `string | Uint8Array<ArrayBuffer>`
  specifically — Node's `Buffer` type resolves to `Uint8Array<ArrayBufferLike>`,** which doesn't
  satisfy that stricter generic and fails `tsc --noEmit` (not caught by `eslint`/runtime, only a
  real generated-project typecheck surfaced it). Fixed by calling `.toString('utf8')` on the raw
  body before passing it — Stripe's own docs list the string form as an equally valid input, so
  this isn't a workaround, just the simpler of two valid call shapes.
- **The webhook needs a tenant id, but Stripe calls it with no session at all — same
  chicken-and-egg shape as `TenantContext`'s own bootstrap problem, solved differently.** Rather
  than looking anything up, `BillingService.createCheckoutSession` stamps `tenantId` into
  `subscription_data.metadata` at Checkout-session-creation time (when a real tenant-scoped request
  *is* available). Every subsequent `customer.subscription.*` webhook event carries that same
  metadata on the Subscription object it's about, so the webhook handler reads `tenantId` straight
  off the event payload and calls `forTenant(tenantId)` directly — the exact same pattern
  `auth.ts`'s signup hook already uses to write the first `membership` row outside any request
  context. (Checkout *Session* metadata, by contrast, does **not** propagate to the Subscription
  object on its own — hence setting it in `subscription_data.metadata` too, not just top-level.)
- **`subscription` is RLS-protected like `membership`, but with only one `USING` branch, not
  two.** `membership`'s policy has a `forUser()` escape hatch specifically because `TenantContext`
  has to read membership *before* a tenant is known. `subscription` never has that problem — every
  write already knows its `tenantId` up front (from Checkout metadata, as above), and every read
  goes through `TenantContext`'s already-established tenant scope (`ActiveSubscriptionGuard`) — so
  its policy only needs the tenant branch, on both `USING` and `WITH CHECK`.
- **`Subscription` gets a real Prisma `@relation` to `Tenant`, unlike `Membership`'s relation to
  `User`.** The raw-SQL-FK workaround in the tenancy gotchas above exists only because `User` is
  overwritten by `auth generate` on every run; `Tenant` is a hand-authored model with no such
  problem, so `Subscription.tenant` is an ordinary declared relation — no raw SQL needed for its FK.
- **Verified without a real Stripe account**, matching this bundle's existing "generation +
  typecheck + real `pnpm install`/build" verification bar for pieces that don't need Docker: a real
  generated project's `api/` was typechecked clean (zero errors beyond the pre-existing "Prisma
  client not generated yet" cascade also present before this slice), and separately, the `stripe`
  package's own `webhooks.generateTestHeaderString`/`constructEvent` were used directly (no network
  calls) to confirm a validly-signed test event verifies and survives with its `tenantId` metadata
  intact, and a tampered signature is rejected. Driving a real Checkout session or a real webhook
  delivery against a live Stripe account (test mode, `stripe listen --forward-to`) is still manual,
  same as the Docker/Postgres pieces.

## Gotchas hit while adding the Projects resource

This slice is the first one verified with a *complete* live pass (Docker Postgres, Node 22, a real
running API, real HTTP requests, two tenants, a role downgrade via direct SQL) rather than
typecheck/build alone — and that live pass caught several real, previously-latent bugs that no
amount of `tsc --noEmit` would have surfaced. Read this before assuming "it typechecks" means "it
works."

- **`api/tsconfig.json` was missing `esModuleInterop`, and `allowSyntheticDefaultImports: true`
  alone is exactly the trap that looks fine until runtime.** `allowSyntheticDefaultImports` only
  relaxes the *type checker* — it doesn't change codegen. Without `esModuleInterop`, TS compiles
  `import Stripe from 'stripe'` to a bare `require("stripe")` and then reads `.default` off it
  unconditionally; `stripe`'s actual CJS export is `module.exports = StripeConstructor` (no
  `.default` property at all, no `__esModule` flag), so `new Stripe(...)` becomes
  `new stripe_1.default(...)` where `stripe_1.default` is `undefined` — `TypeError: ... is not a
  constructor`, at request time (when `BillingService` first gets instantiated), not at build time.
  `tsc --noEmit` reports zero errors for this — the type checker has no way to know the codegen is
  wrong. Fixed by adding `esModuleInterop: true` to the base template's `api/tsconfig.json`. Any
  future default-imported CJS dependency would have hit the identical silent trap.
- **`incremental: true` in `api/tsconfig.json`, combined with `nest-cli.json`'s
  `deleteOutDir: true`, can silently produce a broken partial build.** TS's incremental buildinfo
  file lands *outside* `dist/` by default when unconfigured (observed at `api/tsconfig.tsbuildinfo`,
  sibling to `dist/`, not inside it) — so `deleteOutDir: true` wiping `dist/` never invalidates it.
  On the next build, tsc's stale cache can believe some already-compiled files are unchanged and
  skip re-emitting them, even though their actual output was just deleted — the result is a `dist/`
  with some files present and others silently missing (reproduced twice: once leaving out
  `app.module.js` entirely while `main.js` compiled fine, so `node dist/main.js` failed with
  `Cannot find module './app.module'`). `nest build`'s own asset-copying step (unrelated to tsc's
  incremental tracking) always ran fine, which made the missing *compiled* files easy to miss.
  Fixed by removing `incremental: true` — a scaffolded starter has no real need for it, and the
  footgun is worse than the perf loss. If you ever reintroduce incremental compilation here, point
  `tsBuildInfoFile` explicitly *inside* `outDir` first.
- **`PoliciesGuard` needed `@Injectable({ scope: Scope.REQUEST })`, and didn't have it.** This was
  the single most serious bug this pass found: CASL enforcement was silently non-functional for
  every `@CheckPolicies()`-guarded route. `PoliciesGuard` is registered globally via `APP_GUARD`
  and depends on the request-scoped `TenantContext`; Nest's usual "a provider that injects a
  request-scoped dependency becomes request-scoped too" behavior does not reliably extend to
  globally-registered enhancers. Without the explicit scope, Nest instantiates one guard instance
  at bootstrap, before any request exists — its constructor never really runs with real arguments,
  so `this.reflector`/`this.tenantContext` are `undefined` on every actual request, and
  `canActivate()` throws `TypeError: Cannot read properties of undefined (reading 'get')` — a plain
  500, not a permission error, on literally every route (`GET /tenants/me` included, which has no
  `@CheckPolicies()` at all — the guard runs globally regardless). Confirmed by direct
  instrumentation: `this` inside `canActivate()` was `PoliciesGuard {}`, an object with no own
  properties, meaning the constructor's assignment lines never executed for that instance. Fixed by
  adding the scope annotation; verified live afterward (`member` correctly gets 403 on
  `PATCH`/`DELETE`, 200/201 on `GET`/`POST`). **Any future global enhancer depending on a
  request-scoped provider needs this same annotation, or it will look like it works in every check
  short of an actual HTTP request.**
- **`AllExceptionsFilter` swallowed every non-`HttpException` error's real content, with nothing
  logged anywhere** — a bare `{"statusCode":500,...,"message":"Internal server error"}` on the
  wire and total silence in the server's own console. This made the `PoliciesGuard` bug above take
  far longer to diagnose than it should have (the fix was found only by temporarily patching the
  filter to `console.error` the raw exception). Fixed in the base template: it now logs
  non-`HttpException` exceptions via Nest's `Logger` before responding, without changing what the
  client ever sees.
- **`app.enableCors()` with no options is incompatible with any cookie-based cross-origin
  request** — it sets `Access-Control-Allow-Origin: *` and no `Access-Control-Allow-Credentials`
  header at all, which the Fetch spec requires browsers to reject when the request itself asked for
  credentials (`fetch(..., { credentials: 'include' })`, which the FE's `api-client.ts` always
  does — Better Auth's session is a cookie, not a bearer token). Confirmed via a real `OPTIONS`
  preflight from `http://localhost:5173` before and after the fix. Fixed in the base template:
  `app.enableCors({ origin: process.env.APP_URL ?? true, credentials: true })` — reuses the
  `APP_URL` env var the billing slice already added (the frontend's own origin), falling back to
  reflecting the request's origin when it's unset (e.g. the no-bundle case, where there's no
  frontend to name).
- **`App.tsx`/`main.tsx` needed marker *pairs*, not single markers** — the first time this recipe
  needed to *wrap* existing base-template JSX rather than just insert alongside it. The existing
  single-marker convention only supports pure insertion above a marker line; wrapping the base
  template's placeholder home page in real `<Routes>`/provider JSX needs content both before *and*
  after it, with the placeholder ending up nested *inside*. The fix: two markers per wrap point.
  `App.tsx`'s `routes-open` snippet ends mid-JSX-expression
  (`<Route path="/" element={`) and `routes-close` closes it (`} /></Routes>`); the marker-comment
  line sitting between them is on its own line immediately before/after the placeholder `<main>`,
  so after both snippets are spliced in and markers stripped, the placeholder becomes the `/`
  route's `element` value, completely unmodified — the no-bundle case (no recipe touching these
  markers) renders byte-for-byte what it always did. `main.tsx` uses the identical pattern for
  wrapping `<App />` in `<QueryClientProvider>`/`<BrowserRouter>`. This keeps `react-router-dom`
  and `@tanstack/react-query` out of the base template's own dependencies entirely — they're
  `app/`'s `packageJsonPatch` additions, applied only when this bundle is selected.
- **`packages/shared` needed a dual CJS/ESM build — a single CJS build silently broke `vite
  build` specifically, not `tsc` or `node`.** This was the hardest bug in this pass to pin down.
  Symptom: `defineAbilityFor` "is not exported by" the shared package, during `vite build` only —
  `tsc -b` passed clean, and `node`-based CJS consumption (the API) worked fine. Root-caused by
  elimination (tried explicit named re-exports instead of `export *`, tried collapsing the
  re-export barrel, tried a hand-written maximally-plain CJS file with zero TS-generated
  machinery — *all* of them still failed) down to: Rollup's CJS-named-export static analysis
  doesn't reliably apply to a package resolved through a **pnpm workspace symlink** rather than a
  real `node_modules` copy — `resolve.preserveSymlinks: true` and explicit
  `build.commonjsOptions.include` patterns targeting the package's path both failed to fix it too.
  The robust fix, not a workaround: `packages/shared` now builds to *both* `dist/cjs/` (via
  `tsconfig.json`, unchanged) and `dist/esm/` (via a new `tsconfig.esm.json`, `module: ESNext`),
  with `package.json`'s `exports` map pointing `require` at the CJS build and `import` at the ESM
  one. Vite/Rollup then consumes genuine, statically-analyzable ESM with no CJS-interop layer
  involved at all — the actual bug class disappears rather than being routed around. Verified with
  a real `vite build` producing a working bundle, both immediately after the fix and again from a
  completely fresh `generate()` → `pnpm install` → build. `postInstall.ts`'s
  `pnpm run build` in `packages/shared` now runs both `tsc` invocations (the package's own
  `build` script does `tsc -p tsconfig.json && tsc -p tsconfig.esm.json`) — no engine/postInstall
  code changes were needed for this.
- **`Project` gets the same single-`USING`-branch RLS policy shape as `Subscription`, for the same
  reason**: it's never looked up before a tenant is known, so it doesn't need `membership`'s
  `forUser()` escape hatch. Unlike `Subscription`, this one *was* live-verified with a real
  cross-tenant HTTP test (see above).
- **Better Auth's React client basics, confirmed against real responses, not assumed from
  types**: `useSession().data` is the literal value `null` (not `undefined`, not an empty object)
  once resolved with no session — checked via a raw `GET /auth/get-session` response, not the
  client library's TS types alone. `signIn.email()`/`signUp.email()` return `{ data, error }`
  rather than throwing. `requireEmailVerification: true` (set in the auth slice) means a fresh
  signup's session can't authenticate anything until the verification link is visited — since
  email delivery is a `console.log` stub, `SignupPage` says so explicitly instead of redirecting to
  a login that would just fail.
- **Full verification methodology for this slice**: generated a project fresh, `pnpm install` at
  the workspace root, built `packages/shared`, ran the exact `postInstall.ts` steps by hand
  (`prisma generate` → `auth generate` → `migrate dev` → `prisma generate` again → copy
  `enable-rls.sql` into a timestamped migration → `migrate deploy`), built and started the real
  compiled API (`nest build` + `node dist/main.js`, not `ts-node`/watch mode), then drove it with
  curl: signup → visit the console-logged verification link → sign in → `GET /tenants/me` →
  create/list/update a project → confirm `tenantId` never appears in the response → sign up a
  second user (separate tenant) → confirm their project list is empty and direct access to the
  first tenant's project 404s → downgrade the first user's role to `member` via
  `docker compose exec postgres psql` directly → confirm `PATCH`/`DELETE` now 403 while `GET`/
  `POST` still succeed. Separately, `tsc -b` and `vite build` (production) were run against the FE
  in the same generated project. Repeated this whole pass a second time, from a clean `generate()`
  call, once every fix above was in place, to confirm nothing was verified against a
  hand-patched-in-place copy that didn't reflect the real recipe source.

## Gotchas hit while adding the automated test suite

The base template's Jest scaffolding (unit + e2e) and this bundle's own tests
(`projects.service.spec.ts`, `test/golden-path.e2e-spec.ts`) turn the manual verification flow
described above into something that runs with `pnpm test`/`pnpm test:e2e`. Getting there hit
several more real bugs, on top of the earlier slices' — this is the deepest, most
config-format-specific set of gotchas in the whole bundle so far.

- **`@thallesp/nestjs-better-auth` (and `better-auth` itself) ship ESM-only, and Jest's
  CommonJS-based test runner cannot load a real `.mjs` file even with a transform explicitly
  configured for it.** This is a genuine, current Jest limitation, not a misconfiguration — the
  error message itself says so ("Use Node v24.9+ where Jest supports require(esm) natively"). Node
  22's own `require()` *can* load this package natively (confirmed: the real compiled app boots
  fine), but Jest's own module loader doesn't yet have that capability even running under Node 22.
  Tried and confirmed **not sufficient** on their own: adding `.mjs` to the transform pattern;
  `transformIgnorePatterns` overrides (including one correctly scoped to pnpm's actual
  `.pnpm/<pkg>@<version>/node_modules/<pkg>` nesting — verified as syntactically correct against
  the real failing path, and still didn't work); `isolatedModules: true`. The actual fix: **don't
  try to transform the real ESM package at all — mock it.** A manual Jest mock
  (`api/test/__mocks__/thallesp-nestjs-better-auth.ts`, exporting no-op stand-ins for the two
  runtime symbols actually used, `AllowAnonymous` and `AuthModule`) wired via
  `jest.moduleNameMapper`, so Jest's loader never touches the real file for unit tests at all.
- **The engine gained `packageJsonPatch.jestModuleNameMapper` to make the mock above possible.**
  `packageJsonPatch` previously only merged `dependencies`/`devDependencies`/`scripts` — a
  deliberately narrow set of top-level `package.json` keys, not a generic config merger. Rather
  than widen it to arbitrary Jest config (which has array/tuple-shaped fields like `transform` that
  a flat string-record merge can't represent safely), it grew one new, narrowly-scoped field that
  merges into `package.json`'s `jest.moduleNameMapper` specifically — the one shape a recipe
  legitimately needs for "redirect Jest's resolution of a problematic dependency to a mock." See
  `src/engine/packageJson.ts`'s `mergeFragment`/`mergeRecord` and `src/engine/types.ts`.
- **Both e2e specs (the base template's own, and this bundle's `golden-path.e2e-spec.ts`) spawn
  the real compiled server (`node dist/main.js`) rather than using Nest's in-process
  `TestingModule` — deliberately, not merely for parity with the manual verification process.**
  The base template's own `app.e2e-spec.ts` was *first written* using
  `Test.createTestingModule({ imports: [AppModule] }).compile()`, which worked fine with no bundle
  selected — then broke the moment this bundle was applied, because `AppModule` transitively
  imports Better Auth's ESM-only packages for real (not through a mockable single import site the
  way `app.controller.ts`'s `AllowAnonymous` is). Mocking every ESM dependency that could ever end
  up in `AppModule`'s transitive closure doesn't scale as more bundles/recipes are added. Spawning
  the real server sidesteps the whole class of problem structurally: Jest's module loader never
  touches app code at all, it just makes HTTP requests to an already-running process — exactly like
  a browser or `curl` would, and exactly what's actually deployed.
- **The unit-test and e2e Jest configs must resolve `<rootDir>` to the *same* directory, or a
  shared `moduleNameMapper` value silently points to the wrong place in one of them.** Nest's own
  default scaffolding gives unit tests `rootDir: "src"` (in `package.json`'s `jest` block) and e2e
  tests `rootDir: ".."` relative to `test/jest-e2e.json` (i.e. `api/`) — two different effective
  roots. A `moduleNameMapper` value written as `<rootDir>/../test/__mocks__/...` (correct for
  `rootDir: "src"`) resolves one directory too high when reused verbatim under the e2e config's
  `rootDir`. Fixed by standardizing both configs on `rootDir` = `api/` (unit tests use
  `roots: ["<rootDir>/src"]` to scope discovery instead of changing `rootDir` itself), so a single
  mapper value (`<rootDir>/test/__mocks__/...`) is correct under both.
- **`test/jest-e2e.json` became `test/jest-e2e.js`** specifically so it can
  `require('../package.json').jest?.moduleNameMapper` and inherit whatever a recipe contributed via
  `jestModuleNameMapper`, rather than needing its own separate, hard-to-target injection point for
  the exact same value. Plain JSON can't express that composition.
- **Jest, with `rootDir` widened to the whole `api/` folder, will scan `dist/` too unless told
  not to** — surfaced as a `jest-haste-map: Haste module naming collision` warning, because the
  generated Prisma client's own `package.json` exists both under `src/generated/prisma/` and (after
  a build) `dist/generated/prisma/`, and Jest's haste map doesn't expect two files with the same
  declared package name. Fixed by scoping both configs' `roots` explicitly (`<rootDir>/src` for
  unit, `<rootDir>/test` for e2e) instead of letting either scan the whole `rootDir`.
- **`nest build` needed a real `tsconfig.build.json`, and its `exclude` list needed to fully
  re-list everything the base `tsconfig.json` already excluded.** Without a `tsconfig.build.json`,
  `nest build` fell back to the plain `tsconfig.json`, which has no reason to exclude `*.spec.ts`/
  `test/` — so unit and e2e spec files were being compiled straight into `dist/`, harmless but
  wasteful. Adding one (Nest's own standard convention, extending the base config) fixed that —
  *except* `"extends"` in `tsconfig.json` **replaces** array-valued fields like `exclude` wholesale,
  it does not merge them with the base config's own `exclude` list. The base `tsconfig.json` had
  `"*.config.ts"` in its `exclude` specifically to keep `prisma.config.ts` out of the app build
  (Prisma's CLI reads that file directly; it's never imported by app code) — a `tsconfig.build.json`
  that excluded `test`/`**/*spec.ts` without also re-adding `"*.config.ts"` silently broke that,
  reintroducing a `prisma.config.ts is not under rootDir` build error that had already been solved
  once, for a different file, in an earlier slice.
- **Better Auth's `requireEmailVerification: true` (set in the auth slice) has no automated-testing
  escape hatch by default** — a fresh signup's session can't authenticate anything until the
  console-logged verification link is visited, which an automated test has no inbox or console
  output to parse. Rather than querying Better Auth's internal `verification` table directly (
  coupling a test to its internal schema), `auth.ts` now reads
  `requireEmailVerification: process.env.NODE_ENV !== 'test'` — Jest sets `NODE_ENV=test`
  automatically, and the e2e spec also passes it explicitly to the spawned server's `env`. Verified
  both directions live: a real (non-test) `node dist/main.js` still returns
  `403 EMAIL_NOT_VERIFIED` on an unverified sign-in exactly as before; only the spawned e2e-test
  server skips it.
- **The Jest test *process itself* never loads `.env`** — only the spawned server does, via its own
  `main.ts`'s `import 'dotenv/config'`. `golden-path.e2e-spec.ts`'s own `PrismaClient` (used only
  for the RBAC test's role downgrade, connecting directly rather than through the API) reads
  `process.env.DATABASE_URL` in the *test* process, which was `undefined` until the spec file added
  its own `import 'dotenv/config'` at the top — surfaced as a Postgres `SASL:
  SCRAM-SERVER-FIRST-MESSAGE: client password must be a string` error (an empty/undefined
  connection string reaching the Postgres driver), not an obviously-about-env-vars error.
- **Prisma 7's client takes a driver `adapter`, not a `datasourceUrl` option** — `new
  PrismaClient({ datasourceUrl: ... })` is a pre-7 API shape and fails to typecheck
  (`Object literal may only specify known properties`). Matches the same driver-adapter pattern
  already used everywhere else in this bundle (`PrismaService`, `auth.ts`): `new PrismaClient({
  adapter: new PrismaPg({ connectionString: ... }) })`.
- **No invite-a-teammate flow exists**, so the e2e RBAC test downgrades a user's own membership
  role directly via Prisma, connected as the migration superuser (`DATABASE_URL`, not
  `APP_DATABASE_URL`) — the same legitimate RLS-bypass escape hatch migrations already use, applied
  here for test setup rather than schema changes. Never do this from real application code.
- **Verified twice, from a clean `generate()` call each time**, with zero manual patches applied to
  the second pass: `pnpm install` → build `packages/shared` → Docker Postgres →
  `postInstall.ts`'s migration steps by hand → `pnpm test` (7 unit tests) → `nest build` →
  `pnpm test:e2e` (4 e2e tests, two server instances spawned on different ports for the base and
  bundle e2e specs, running concurrently without interfering) → a final manual curl confirming real
  (non-test) signup still requires email verification.

## Gotchas hit while adding Material UI

- **MUI is baked directly into this bundle's own page files, not shipped as a separate `ui/mui`
  category recipe.** `docs/product-scope.md` §12 frames a pluggable UI-library *choice* as Phase 2
  scope; Phase 1 bakes in exactly one default. A separate category recipe would also have needed to
  *replace* `LoginPage.tsx`/`SignupPage.tsx`/etc., which `apply.ts`'s `copyTree` can't do (it throws
  on any file collision between recipes/base) — there was no unstyled version of these pages to
  begin with, so there was nothing for a separate recipe to layer on top of.
- **`ThemeProvider`/`CssBaseline` reuse the `providers-open`/`providers-close` marker pair the
  Projects slice already added** to `main.tsx` for `QueryClientProvider`/`BrowserRouter` — extending
  a recipe's own previously-added marker content needs no engine or base-template change at all,
  just editing the recipe's own inject snippets.
- **MUI v9's `TextField` takes HTML input attributes via `slotProps={{ htmlInput: {...} }}`, not
  the older `inputProps={{...}}`** (used for `SignupPage`'s password `minLength`) — verified against
  a real `tsc -b` in a generated project, not assumed from memory of older MUI versions.
- **Verified via `tsc -b` + `vite build` (both clean) and by fetching the Vite dev server's actual
  transformed page modules** — the same bar as the earlier FE verification in the Projects slice.
  No browser-automation tooling was available to visually confirm rendering.

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
