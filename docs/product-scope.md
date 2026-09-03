product-scope.md

# Inikitty — Product Scope Document

## 1. Product overview

Inikitty is a scaffolding tool (`npx create-inikitty`) that generates a fully wired, production-ready SaaS starter — not just a pile of installed dependencies. A developer runs the CLI, answers a few prompts about their preferred stack, and gets a running application where authentication, multi-tenancy, role-based access control, billing, and one example CRUD resource are already connected end-to-end.

**Core principle:** the deliverable is a working `POST /auth/signup` → tenant-scoped, RBAC-guarded `GET /projects` flow — not a `package.json` with the right dependencies listed. Users should be able to delete the example resource and start writing their actual business logic on day one.

## 2. Goals

- Eliminate the 4–8 weeks typically spent rebuilding auth, multi-tenancy, RBAC, and billing for every new SaaS product.
- Ship a CLI that generates a working app in under 5 minutes from `npx create-inikitty` to `npm run dev`.
- Support a small number of well-tested stack combinations rather than a large number of loosely wired ones.
- Provide one fully wired example resource (tenant-scoped, RBAC-guarded, validated, with a frontend page) that acts as the template for all future business logic.

## 3. Non-goals (for v1)

- Not supporting every possible combination of DB/ORM/auth/payment/UI library. Start with one fully wired "golden path" and expand later.
- Not building a hosted/managed version of the tool. v1 is a local CLI generating a local repo.
- Not supporting non-TypeScript stacks (Python/Ruby) in v1.
- Not building schema-per-tenant or DB-per-tenant isolation in v1. Shared DB + row-level security only.

## 4. Target user

A solo founder or small team (1–5 engineers) who has validated (or is validating) a SaaS idea and wants to spend their time on the product's differentiated logic, not on rebuilding auth/billing/tenancy infrastructure they've already built before on a previous project.

## 5. Architecture overview

Three independently deployable pieces are generated:

1. **API backend** — NestJS + TypeScript. Owns auth, multi-tenancy, RBAC, billing webhooks, and business logic. Exposes a REST API.
2. **App frontend** — Vite + React + TypeScript SPA. No SSR. Calls the API backend. Behind login, so no SEO requirement.
3. **Marketing site** — out of scope for the generator itself (left to the user), but the scope document should note the app frontend and marketing site are deployed separately and never share a codebase.

The generator only produces (1) and (2).

## 6. Tech stack decisions (v1 golden path)

| Layer              | Choice                                                      | Rationale                                                                                                            |
| ------------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Backend framework  | NestJS + TypeScript                                         | Structure, DI, guards/interceptors map cleanly onto auth/RBAC/tenancy concerns                                       |
| Database           | PostgreSQL                                                  | Native row-level security (RLS) support for multi-tenancy                                                            |
| ORM                | Prisma (default) with Drizzle as a v1.x option              | Prisma has stronger DX for teams starting out; Drizzle offered once the Prisma path is proven                        |
| Auth               | Better Auth                                                 | Open source, self-hosted, no per-MAU cost, supports sessions/social login/MFA                                        |
| Authorization      | CASL                                                        | TypeScript-native, isomorphic (shared rules FE+BE), integrates with NestJS guards                                    |
| Payments           | Stripe (Billing + Customer Portal + Webhooks)               | Most mature subscription billing platform                                                                            |
| Validation         | class-validator + class-transformer                         | NestJS-native DTO validation and response serialization                                                              |
| Frontend framework | Vite + React + TypeScript                                   | Plain SPA, no SSR overhead, fast dev server                                                                          |
| Server state       | TanStack Query                                              | Standard data-fetching/caching layer for API calls                                                                   |
| UI components      | shadcn/ui (default) with Ant Design / MUI as future options | Copy-in-source model lets generated business components sit behind a thin wrapper layer, making later swaps possible |
| Monorepo tooling   | Turborepo (optional, prompt-gated)                          | Keeps API + app in one repo without forcing it                                                                       |

## 7. Core features — detailed spec

### 7.1 Authentication

- Endpoints: `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`, `GET /auth/me`.
- Session strategy: JWT access token (short-lived) + refresh token (httpOnly cookie).
- A `@CurrentUser()` param decorator usable in any controller, returning the authenticated user plus their active tenant/membership.
- Password hashing, email verification flow, and password reset flow included out of the box.

### 7.2 Multi-tenancy

- Data model: `Tenant`, `User`, `Membership` (join table with a `role` field), all app tables carry a `tenant_id` column.
- Tenant resolution: JWT claim carries the active `tenant_id` (default strategy — subdomain-based resolution is a documented alternative, not built by default).
- A `TenantContextMiddleware`/interceptor resolves the tenant per-request and exposes it via a request-scoped provider.
- Postgres RLS policies enforce `tenant_id` scoping at the database level, so a bug in application code cannot leak cross-tenant data.
- ORM query layer (Prisma middleware, or Drizzle wrapper) automatically injects the tenant filter — a developer should not be able to write a query that forgets to scope by tenant.

### 7.3 Role-based access control

- CASL wired into a `PoliciesGuard` + `@CheckPolicies()` decorator usable on any controller method.
- Three default roles seeded: `owner`, `admin`, `member`, each with example ability definitions.
- Ability definitions are tenant-aware (a user's abilities are scoped to their membership/role within the active tenant, not global).

### 7.4 Billing

- Stripe Checkout session creation endpoint tied to `Tenant`.
- Webhook endpoint (`POST /billing/webhook`) verifying Stripe signatures and updating a `Subscription` table (status, plan, current period end).
- Customer portal redirect endpoint for self-serve plan changes/cancellation.
- A `@RequiresActiveSubscription()` guard usable to gate premium routes.

### 7.5 API layer / DTO protection

- Global `ValidationPipe` configured with `whitelist: true, forbidNonWhitelisted: true`.
- Per-resource DTO convention: `CreateXDto`, `UpdateXDto` (as `PartialType(CreateXDto)`), `XResponseDto` (with `@Exclude()` on internal/sensitive fields via a serialization interceptor).
- Consistent error response shape and a global exception filter.

### 7.6 Example resource: Projects

- A complete, deliberately simple CRUD resource (`Project`: id, tenant_id, name, created_by, created_at) implemented end-to-end:
  - NestJS module/controller/service, tenant-scoped, RBAC-guarded (e.g. only `admin`/`owner` can delete).
  - DTOs with validation.
  - Frontend list/create/detail pages calling the API via TanStack Query.
- Documented as "delete this and copy the pattern for your real resources."

## 8. CLI scaffolding tool

### 8.1 Behavior

`npx create-inikitty` prompts for (v1 scope — options in parentheses are stretch/future):

- Project name
- Database (Postgres only in v1)
- ORM (Prisma default; Drizzle stretch)
- Auth provider (Better Auth only in v1)
- Payment provider (Stripe only in v1; Paddle/Lemon Squeezy future)
- UI library (shadcn/ui only in v1; Antd/MUI future)
- Monorepo (yes/no, Turborepo if yes)
- AI agent formats (multi-select, optional) — `AGENTS.md` is always generated regardless of selection; this prompt only controls which additional vendor-specific shim(s) get generated alongside it (e.g. Claude Code, Cursor, Copilot). None selected by default in v1.

### 8.2 Generation approach

- One base template (minimal NestJS + Vite skeleton, nothing wired).
- Because auth, tenancy, RBAC, and billing all touch the same request lifecycle, v1 does not treat these as independent toggles — the fully wired golden path (Prisma + Better Auth + CASL + Stripe + shadcn) is generated as a single integrated recipe.
- Recipe application: copy new files as-is; for shared files (`app.module.ts`, `.env.example`, `package.json`) use marker-comment injection points that each recipe appends to, rather than blind string replacement.
- After file generation: install only the dependencies the selected recipe needs, run initial Prisma migration against a bundled `docker-compose.yml` Postgres instance, and print next steps.

### 8.3 Testing requirement

- A CI job that generates the project fresh, runs migrations, starts the API, and hits `/auth/signup`, `/auth/login`, and the `/projects` CRUD endpoints to confirm the golden path stays wired as the templates evolve.

### 8.4 Extensibility architecture (build this in from v1, even with one recipe)

The generator engine must not hardcode knowledge of specific tools (Prisma, Better Auth, etc.). It only knows how to discover recipes, read their manifests, and apply them to the base template. This lets future combinations be added by writing a new recipe, without modifying the engine.

**Recipe folder contract:**

```
recipes/<category>/<id>/
  manifest.ts     // id, category, conflicts/requires other recipe ids, packageJsonPatch, envVars
  files/          // files copied as-is into the generated project
  inject/         // snippets keyed to marker-comment injection points in the base template
  postInstall.ts  // e.g. run initial migration, seed roles
```

**Two recipe kinds:**

- **Category recipes** — for choices that are genuinely independent of everything else (e.g. UI library). These can be freely mixed with any other category recipe.
- **Bundle recipes** — for choices that are integration-coupled and must be tested together (e.g. ORM + auth provider + tenancy wiring + RBAC). A bundle spans multiple categories as one unit. v1 ships exactly one bundle (`prisma-betterauth-casl-stripe`). Adding Drizzle support later means authoring a second bundle (`drizzle-betterauth-casl-stripe`) rather than trying to make ORM and auth independently pluggable — that seam is where "loosely wired" bugs actually happen, so it stays a single tested unit until proven safe to split further.

**Engine responsibilities (v1, generalized from day one):**

1. Discover available recipes (local `recipes/` folder in v1; potentially separate npm packages later without changing this interface).
2. Resolve the user's selections into a concrete list of recipes to apply (one bundle + zero or more category recipes), checking `conflicts`/`requires` declared in manifests.
3. Apply the base template, then each recipe's `files/` and `inject/` snippets, in a defined order.
4. Merge `packageJsonPatch` from all applied recipes and run install.
5. Run each recipe's `postInstall.ts` in order.

**CLI prompt implication:** in v1 the "pick a bundle" step has only one option, so it may not even surface as a visible prompt yet — but the underlying selection-and-resolution logic should already be written generally, so that adding a second bundle later is a content change (write the new recipe) rather than an engine rewrite.

**CI implication:** the existing golden-path CI check (8.3) should be written to run once per available bundle, so it automatically covers new bundles as they're added rather than needing a rewrite.

## 9. Testing strategy (test-first, both for the tool and generated projects)

Test-first applies at two levels: building Inikitty itself, and what Inikitty ships inside every generated project.

### 9.1 Testing the tool itself

The tool has real internal logic (recipe resolution, conflict checking, file injection, manifest merging) that deserves unit-level coverage independent of whether a full project generation succeeds — a fast unit suite should catch, e.g., a manifest merge bug without needing to run a real `npm install` and Postgres migration every time.

- **Unit tests** for the engine's internals in isolation: manifest parsing, `conflicts`/`requires` resolution between recipes, the marker-comment injection logic, `packageJsonPatch` merging. These run fast, with no filesystem writes beyond a temp dir and no real package installs.
- **E2E tests** that actually run `create-inikitty` end-to-end for each available bundle: generate a real project into a temp directory, run `npm install`, run the initial migration against a real (containerized) Postgres, start the API, and hit `/auth/signup`, `/auth/login`, and `/projects` to confirm the golden path works as an outside observer would experience it.
- Test-first applies to both layers: before writing a recipe's files, write the unit test asserting its manifest resolves correctly and the e2e assertion asserting the generated app behaves correctly. A bundle is not shippable until both pass.
- Recipe manifests should declare their own test fixtures where relevant (e.g. seed data needed to exercise RBAC roles), so `postInstall.ts` can leave a testable, seeded environment rather than an empty database.

### 9.2 Testing inside generated projects

Every generated project ships with a working test suite from the start, not an empty `tests/` folder:

- **Unit tests** for the example `Projects` resource's service layer (business logic in isolation, tenancy/RBAC checks mocked).
- **Integration/e2e tests** (e.g. via `supertest` against a test database) covering: signup → login → create project → list projects (should only see own tenant's projects) → attempt cross-tenant access (should be rejected) → attempt an RBAC-restricted action as a `member` (should be rejected).
- A documented convention for adding tests to new resources, following the `Projects` example, so a user copying the example resource copies its tests too.
- Test commands are one of the required entries in the generated project's AI-agent context file (§11) so an AI coding assistant runs the suite rather than skipping it.

## 10. Documentation strategy

Documentation is split into two audiences: people building Inikitty, and people using a project Inikitty generated.

### 10.1 Documentation for the tool

- A `docs/` site (or well-organized `docs/` folder if a full site is premature) covering: getting started, how the recipe/bundle system works, how to author a new recipe, and an architecture decision record (ADR) explaining _why_ each golden-path choice was made (Prisma over Drizzle, Better Auth over Auth0, CASL over Casbin, etc.) so future maintainers don't relitigate settled decisions without cause.
- A contribution guide specifically for adding new recipes/bundles, referencing the plugin contract in §8.4.

### 10.2 Documentation generated inside every project

- A generated `README.md` that is assembled from the applied recipes (each recipe contributes its own README section), not a single static template — so the README always accurately reflects what's actually wired in that specific generated project.
- An `ARCHITECTURE.md` explaining the tenancy → auth → RBAC → data access flow in prose and a diagram, since this is the part newcomers most need to understand before touching the code.
- Auto-generated API reference: NestJS's Swagger/OpenAPI module wired by default, exposed at `/api/docs`, so the API surface is always documented without manual upkeep.

## 11. AI-agent readiness (vibe-coding support)

Since users are expected to do AI-first ("vibe coding") development with whatever agent they personally use — Claude Code, Cursor, Copilot, Codex, Gemini CLI, or others — this must be built agent-agnostic. No single vendor's format is a required dependency; the tool should not assume or favor any particular AI product.

- **`AGENTS.md` at project root is the single source of truth.** This is the harness-neutral, vendor-independent standard (stewarded by the Agentic AI Foundation under the Linux Foundation) that Claude Code, Cursor, Copilot, Codex, Gemini CLI, and others all read natively or via a thin shim. Every project generated by Inikitty gets one, and it is the only file that contains real content — everything else is a pointer to it.
  - Content must be concrete and evidence-based (exact commands with flags, real file paths, actual conventions this specific generated project uses), assembled from what each applied recipe actually did — not static boilerplate. Generic or invented context has been shown to _reduce_ agent task success, so accuracy matters more than length.
  - Required contents: exact dev/test/migration commands; the tenancy rule as a hard constraint (every query on a tenant-scoped table must go through the tenant-scoped query helper, never the table directly); the RBAC convention with a real example from the `Projects` resource; the DTO convention (never return an entity directly, always a response DTO); directory responsibilities; explicit "never do X" guardrails (never bypass the tenant helper, never commit `.env`, never remove `whitelist: true` from the global ValidationPipe).
- **Vendor-specific files are an optional, user-selectable category recipe — never a default.** During the CLI prompts, the user can choose zero or more vendor-specific formats to additionally generate (e.g. a Claude Code skill, a Cursor rules file, a Copilot instructions file). Each is implemented as its own category recipe under the plugin architecture in §8.4, exactly like a UI-library choice: independent, additive, and safe to mix. Whichever the user picks, the generated shim is a thin file that imports/points at `AGENTS.md` (e.g. `CLAUDE.md` containing `@AGENTS.md` plus only content meaningless outside that tool) — never a duplicate copy of the content, since a duplicated copy is guaranteed to drift out of sync with the real source of truth over time.
- Because vendor formats are recipes, adding support for a new AI tool later (say, a format some other agent introduces) means authoring one new recipe under `recipes/ai-format/<tool>/`, not changing the core generator — the same extensibility principle applied everywhere else in this document.
- A generic "add a tenant-scoped resource" walkthrough, written as a plain Markdown doc (e.g. `docs/adding-a-resource.md`) referenced from `AGENTS.md`, rather than a vendor-specific skill format. Any agent capable of reading a repo and following instructions can use it, regardless of which vendor shim(s) the user opted into.

## 12. MVP phases

**Phase 1 (golden path only):**
NestJS + Prisma + Postgres (RLS) + Better Auth + CASL + Stripe + Vite/React + shadcn/ui, single recipe, no options prompted beyond project name. Ship this fully wired before adding any CLI branching.

Phase 1 is not considered done when the app merely runs — it is done when all of the following are true for a freshly generated project:

- The §9.2 test suite (unit + e2e for the `Projects` example) exists and passes.
- `README.md`, `ARCHITECTURE.md`, and the `/api/docs` Swagger route are present and accurate.
- `AGENTS.md` and `docs/adding-a-resource.md` (§11) are present and reflect the actual wiring, not placeholder text. Vendor-specific shims (`CLAUDE.md`, `.cursor/rules/`, etc.) are implemented as selectable category recipes but none is required to exist by default in Phase 1 — the CLI should support the "AI agent formats" prompt with at least one working shim recipe (e.g. Claude Code) to validate the category mechanism end-to-end.

**Phase 2:**
Add ORM choice (Drizzle) and UI library choice (Antd, MUI) as alternate recipes, once Phase 1's wiring pattern is stable and covered by the CI check above.

**Phase 3:**
Add payment provider alternatives, monorepo toggle, and subdomain-based tenant resolution as a documented alternative strategy.

## 13. Open questions to resolve before implementation

- Tenant resolution default: JWT claim vs subdomain — confirm JWT-claim-only for v1 is acceptable, or if subdomain routing is a hard requirement from day one.
- Should the example `Project` resource ship with a soft-delete pattern, or is hard delete acceptable for v1?
- Confirm whether email delivery (for verification/reset flows) is wired to a specific provider (e.g. Resend, Postmark) in v1, or left as a stub the user configures.
