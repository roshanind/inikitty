# Recipes & bundles

Every recipe — regardless of kind — lives at `recipes/<category>/<id>/` and follows the same
four-part contract. The engine doesn't care what's inside; it just knows where to look.

```
recipes/<category>/<id>/
  manifest.ts     # id, category, conflicts/requires, packageJsonPatch, envVars
  files/           # copied as-is, mirroring the output layout
  inject/          # snippets keyed to marker comments in files that already exist
  postInstall.ts   # optional: (ctx) => Promise<void>, run after pnpm install
```

## Bundles vs. categories

**Bundle** is the one reserved category. Exactly one bundle must be selected whenever any exist —
it's for integration-coupled choices (ORM + auth + tenancy + RBAC) that only make sense tested
together as a single unit.

Everything else is a **category** recipe: independent, freely mixable, selected zero or more at a
time. A category recipe can declare `requires` on a bundle or another category to constrain valid
combinations — the resolver enforces this before any file is written.

## What's shipped today

| Recipe | Kind | What it adds |
|---|---|---|
| `bundle/prisma-betterauth-casl-stripe` | bundle | Functionally complete: Postgres via Docker Compose + Prisma with a driver adapter, Better Auth wired into NestJS (email+password with verification, a global auth guard), multi-tenancy with Postgres row-level security, CASL RBAC (`PoliciesGuard` + `@CheckPolicies()`, isomorphic rules shared with the frontend via a pnpm workspace package), Stripe billing (Checkout, Customer Portal, webhook-driven subscription sync), and a `Projects` example resource (tenant-scoped, RBAC-guarded CRUD with frontend pages) demonstrating the pattern for real resources. |
| `auth-extra/jwt-plugin` | category | Adds a `GET /auth/token` endpoint that mints a signed JWT from the active session. Purely additive — `requires` the bundle above, changes nothing about how login/session already works. |

## Why bundles don't split further

A second ORM means authoring a second bundle (`drizzle-betterauth-casl-stripe`), not making ORM
and auth independently pluggable — that integration seam is where "loosely wired" bugs happen, so
it stays a single tested unit until proven safe to split. See
[Lessons learned](/lessons) for a concrete example of how tightly these pieces are actually
coupled in practice.
