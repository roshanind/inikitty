# Recipes

- **`bundle/prisma-betterauth-casl-stripe`** — the v1 golden-path bundle. Currently implements the
  auth + Prisma slice (Postgres via Docker Compose, Prisma with the driver-adapter pattern, Better
  Auth wired into NestJS via `@thallesp/nestjs-better-auth`, email+password with a console-log
  email stub, a global `AuthGuard`, `@CurrentUser()`), multi-tenancy (`Tenant`/`Membership`
  models, auto-provisioning on signup, a request-scoped `TenantContext`, and real Postgres
  row-level security — see the tenancy gotchas below), CASL RBAC enforcement (a global
  `PoliciesGuard` + `@CheckPolicies()` decorator in `api/src/casl/`, backed by tenant-aware ability
  definitions in the `packages/shared` workspace package so `app/` can import the same rules — see
  the sharing gotcha below), and Stripe billing (`api/src/billing/`: `POST /billing/checkout` and
  `POST /billing/portal` — both owner-only via `@CheckPolicies()` — plus a public, signature-verified
  `POST /billing/webhook` that syncs a `Subscription` table, and a `@RequiresActiveSubscription()`
  guard for gating premium routes — see the billing gotchas below). The `Projects` example resource
  is not built yet — it lands as the next extension to this same recipe (see its `manifest.ts`
  description and `docs/product-scope.md` §7). No controller uses `@CheckPolicies()` for a real
  resource yet since `Projects` doesn't exist — the CASL guard/ability wiring, and the billing
  endpoints that do use it, are verified by generation + typecheck + a real `pnpm install`/build
  (plus, for the webhook, a real signature verify/reject round-trip using Stripe's own test-header
  helper — see below), not by driving actual HTTP requests against a running app.
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
