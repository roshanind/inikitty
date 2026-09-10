# `shared/betterauth-casl-stripe`

Not a recipe — no `manifest.ts`, so `discoverRecipes()` never picks this up as one. It's a
**shared fragment**: a `files/` and `inject/` tree structured exactly like a recipe root, referenced
via `sharedDirs: ['shared/betterauth-casl-stripe']` in both `prisma-betterauth-casl-stripe`'s and
`drizzle-betterauth-casl-stripe`'s `manifest.ts`.

Every file here is byte-for-byte identical across both bundles because it genuinely doesn't care
which ORM is in play — the CASL guard, the billing controller, the `Projects` DTOs/controller, the
FE pages, `packages/shared`, `docker-compose.yml`, and so on all go through `TenantContext`/services
rather than touching Prisma or Drizzle directly. Before this existed, both bundles carried their own
full copy of each of these files, so a fix or feature in any of them meant editing two places by hand
with nothing to catch a missed one. Now there's exactly one copy; each bundle's `manifest.ts` still
supplies its own ORM-specific files (`prisma/`, `src/db/`, etc.) directly.

When adding a new file here, only add it if it's truly identical across every recipe that declares
this `sharedDirs` entry — if a bundle ever needs a variant, move that one file back into the
bundle's own `files/`/`inject/` rather than trying to parameterize it here.
