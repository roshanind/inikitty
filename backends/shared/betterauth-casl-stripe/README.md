# `backends/shared/betterauth-casl-stripe`

Not a recipe — no `manifest.ts`, so `discoverRecipes()` never picks this up as one. It's a
**shared fragment**: a `files/` and `inject/` tree structured exactly like a recipe root, referenced
via `sharedDirs: ['../../shared/betterauth-casl-stripe']` in both
`backends/nestjs/recipes/bundle/prisma-betterauth-casl-stripe/manifest.ts` and
`.../drizzle-betterauth-casl-stripe/manifest.ts`.

Every file here is byte-for-byte identical across both bundles because it genuinely doesn't care
which ORM is in play — the CASL guard, the billing controller, the `Projects` DTOs/controller,
`packages/shared`, `docker-compose.yml`, and so on all go through `TenantContext`/services rather
than touching Prisma or Drizzle directly. Before this existed, both bundles carried their own full
copy of each of these files, so a fix or feature in any of them meant editing two places by hand
with nothing to catch a missed one. Now there's exactly one copy; each bundle's `manifest.ts` still
supplies its own ORM-specific files (`prisma/`, `src/db/`, etc.) directly.

**This fragment is backend-scoped, not the FE pages too.** It used to also carry the shared
frontend pages (Login/Signup/Projects), back when there was one combined `recipes/` tree for the
whole stack. Once backend and frontend became independently pluggable axes (see
`docs/product-scope-phase-2.md`), those pages moved out entirely to
`frontends/react-vite/recipes/pages/betterauth-casl-stripe-pages/` — they don't need a `sharedDirs`
fragment of their own today since there's only one frontend, but they're still backend-agnostic by
construction (they only ever talk to the REST contract), which is why they'll stay reusable if a
second frontend framework is ever added.

When adding a new file here, only add it if it's truly identical across every backend bundle that
declares this `sharedDirs` entry — if a bundle ever needs a variant, move that one file back into
the bundle's own `files/`/`inject/` rather than trying to parameterize it here.
