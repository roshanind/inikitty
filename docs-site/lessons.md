# Lessons learned

None of these would have surfaced from reading the code. Each one only showed up after generating
a real project, installing real dependencies, and hitting a real database.

## NestJS had to move to a whole new major version

**Symptom** — `pnpm install` reports an unmet peer dependency on `@nestjs/common`.

**Cause** — The community NestJS–Better Auth package (`@thallesp/nestjs-better-auth`) peers on
Nest `^11.1.6` and Express `^5.1.0`; the base template was still on Nest 10 / Express 4.

**Fix** — Bumped the *base template* itself to Nest 11 — a prerequisite step, re-verified
(install, boot, hit `/health`) before touching the recipe at all.

## Prisma 7 moved the connection URL out of `schema.prisma`

**Symptom** — `prisma generate` fails: `the datasource property url is no longer supported in
schema files`.

**Cause** — Prisma 7 moved the connection URL out of `schema.prisma` and into a required
`prisma.config.ts`.

**Fix** — Added `prisma.config.ts` with `datasource: { url: env('DATABASE_URL') }`; the schema
keeps only `provider = "postgresql"`.

## Every model was `undefined` at runtime, with no error until you called one

**Symptom** — Every model on the Prisma client is `undefined` at runtime, no error, until you call
one: Better Auth then reports *"Model user does not exist in the database"* — even though the
table is really there.

**Cause** — Two stacked bugs: NestJS's build never copies a custom Prisma output path into `dist/`
without explicit asset-copying config, and an extension-filtered copy glob silently dropped the
client's own bundled `schema.prisma` — which the runtime needs to know its models at all.

**Fix** — An *unfiltered* `generated/**/*` asset glob in `nest-cli.json`, plus a second
`prisma generate` after `migrate dev` (which doesn't reliably re-embed the schema on its own).

## pnpm's strict `node_modules` hid two packages nothing imports directly

**Symptom** — A type error naming `zod`'s internals, and separately a runtime `MODULE_NOT_FOUND`
for a package nothing in the recipe imports directly.

**Cause** — pnpm's strict, isolated `node_modules` won't let a package resolve a dependency that
isn't *its own* declared dependency — even if it's installed somewhere in the tree for another
package.

**Fix** — Declared `zod` and `@prisma/client-runtime-utils` as direct dependencies in the recipe's
`packageJsonPatch`, matching what Better Auth and the generated client actually need at runtime.

## The global auth guard silently broke the health check

**Symptom** — `GET /health` starts returning `401 Unauthorized` as soon as the auth bundle is
selected.

**Cause** — The auth package's `AuthGuard` is global by design — every route is protected unless
told otherwise, and a plain health-check endpoint written before auth existed was never told
otherwise.

**Fix** — A new injection marker on `app.controller.ts` lets the recipe add `@AllowAnonymous()` to
`/health` specifically — infra probes stay unauthenticated, everything else stays protected.
