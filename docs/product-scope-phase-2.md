# Inikitty — Product Scope Document: Phase 2 (Multi-Stack Architecture)

## 1. Status and how this relates to `product-scope.md`

This is a **speculative architecture document, not a committed roadmap.** It exists to write down
a direction discussed and refined in conversation, so its shape is on record before anyone builds
toward it — not to declare that Inikitty is now building any of it.

**Naming note:** `product-scope.md` §12 already uses "Phase 2" for something else (ORM choice +
UI-library choice as alternate recipes — both shipped; see `CLAUDE.md`). Treat this document as
**the phase after `product-scope.md`'s Phase 3**, not a literal replacement for its own §12. A
pointer from §12 to this file exists for discoverability; §12 itself is untouched.

**Revision note:** this document originally proposed "stacks" as fixed (backend, frontend) pairs,
with free cross-product composability explicitly out of scope. That framing was revised after
further discussion — see §5, which is the load-bearing section of this document.

## 2. Motivation

Phase 1 proved a specific claim: the recipe/bundle system can grow **within one fixed stack**
(NestJS + TypeScript API, Vite + React app) without engine changes — adding
`drizzle-betterauth-casl-stripe` alongside `prisma-betterauth-casl-stripe` required zero changes to
`discover.ts`/`apply.ts`/`inject.ts`, one small additive change to `resolve.ts` (`requiresAnyOf`),
and the CI matrix picked it up automatically.

This document is about a bigger claim: can Inikitty support more than one backend framework and
more than one frontend framework, freely combined, rather than one fixed pairing? §5 argues yes,
for a specific, defensible reason — and draws a hard line around the one place where "yes" doesn't
hold.

## 3. Goals

- **Free backend × frontend composability, gated by a certified API contract** — not N pre-built
  pairings, but any backend implementation that passes a shared compatibility test suite working
  with any frontend implementation that only depends on the documented contract. This is the
  intended differentiator (§5).
- Preserve everything Phase 1 already proved: markers, `sharedDirs`, `conflicts`/`requires`/
  `requiresAnyOf`, the CLI's selection flow, the CI golden-path pattern — all keep working exactly
  as-is *within* a chosen backend or frontend.
- Keep the one boundary that has real evidence behind it (§6) non-negotiable: ORM, auth, tenancy,
  and RBAC stay a single tested bundle, the same as today.

## 4. Non-goals (for this phase)

- **Not** a commitment to build any specific backend or frontend beyond what's shipped today.
  This document defines the mechanism; which implementations get built is a later, demand-driven
  decision.
- **Not** a relaxation of bundle-level coupling. ORM + auth + tenancy + RBAC remain one tested
  unit per backend — see §6 for why that boundary is different in kind from the backend/frontend
  one, and stays closed.
- **Not** a change to anything Phase 1 shipped — the current NestJS + Vite/React implementation
  keeps working exactly as it does today; this phase is additive.

## 5. The core distinction: in-process coupling vs. wire-protocol coupling

Two different kinds of "these things need to work together" exist in this system, and they don't
carry the same risk:

**In-process coupling** — ORM, auth middleware, tenancy context, and RBAC guards all execute
inside the *same request lifecycle*, sharing memory, transaction state, and execution context.
This project has direct, painful evidence that treating this as independently pluggable breaks:
a `PoliciesGuard` that silently no-oped without explicit `Scope.REQUEST`, RLS policies with subtly
wrong branches, an ESM/Jest interaction that only broke in one specific combination. `requires`ing
a whole tested bundle rather than composing these pieces freely is a conclusion drawn from real
failures, not caution for its own sake.

**Wire-protocol coupling** — a backend and a frontend talk to each other over HTTP/JSON. This is
the single most standardized decoupling boundary in the industry: a REST API is designed to not
care what served it or what's consuming it. NestJS+React talking over REST vs. Django+React talking
over REST is unremarkable, everywhere, already. There is no equivalent evidence in this project (or
generally) that this boundary breaks the way in-process coupling did — because it's architecturally
built to not leak implementation details across it in the first place.

**The conclusion this document draws:** free composability is legitimate at the backend↔frontend
boundary, *provided the contract crossing that boundary is explicit and mechanically enforced* —
not assumed. It is not legitimate inside a bundle, where the evidence says otherwise. Those are two
different rules for two different reasons, not one blanket policy.

## 6. What stays closed, and why

ORM + auth + tenancy + RBAC + billing remain a single tested `bundle`, exactly as today
(`prisma-betterauth-casl-stripe`, `drizzle-betterauth-casl-stripe`). This is **not** revised by this
document — it's the one piece of prior art with real failure evidence behind it, cited in §5. A
bundle lives entirely inside one backend implementation; it is never split across the backend/
frontend boundary this document opens up.

## 7. The contract: what actually makes composability safe

Freedom to combine backend X with frontend Y is only real if both sides are checked against the
same thing, not against each other:

- **A versioned API contract is the source of truth**, not whatever a given backend happens to
  emit. This project already has the raw material: Swagger/OpenAPI is wired at `/api/docs`
  (`product-scope.md` §10.2). Formalizing that spec as a first-class, versioned artifact — routes,
  request/response shapes, auth/session/cookie behavior — is the actual mechanism, not an
  afterthought.
- **A compatibility test suite certifies a backend**, not a manual review. `test/golden-path.e2e-spec.ts`
  already drives real HTTP requests (signup → CRUD → cross-tenant → RBAC) rather than testing
  implementation internals — generalizing it into a contract-conformance suite any backend must
  pass is the natural extension of work already done, not new invention.
- **A frontend is only "compatible" if it only depends on the documented contract** — no reaching
  into backend-specific response quirks. This is a real discipline to hold, not a given; a frontend
  that happens to work against one backend's undocumented behavior isn't actually portable, even if
  it looks like it is today.
- **One real, honest exception: differentiated features need a per-frontend adapter.** The
  isomorphic CASL ability hook is framework-specific on the frontend side by nature — a React hook,
  a Vue composable, and a Svelte store are three different things wrapping the same
  `packages/shared` logic. Plain CRUD over the contract is fully free-form; a feature like the
  ability hook needs a small, framework-idiomatic adapter recipe per frontend. This is a real,
  bounded cost — not a reason to abandon composability, and exactly the kind of scoped, self-
  contained thing an external contributor could add for their own framework without touching the
  backend at all.

## 8. Reuse tiers (within one language, still relevant)

Independent of the backend/frontend axis, swapping frameworks *within the same language* is
cheaper than crossing languages — this still matters for anyone building a new backend or frontend
implementation:

| Tier | Example | What's reusable | What isn't |
|---|---|---|---|
| **0 — same framework** | n/a (Phase 1) | everything | — |
| **1 — same language, different framework** | NestJS → Express/Fastify (both Node/TS) | `packages/shared` (framework-agnostic CASL rule definitions), ORM schema/config, DTOs (mostly) | Framework-specific wiring — NestJS's guards (`CanActivate`), DI modules, decorator-based controllers have no Express/Fastify equivalent. Most of `recipes/shared/betterauth-casl-stripe/files/api/` does **not** transfer as-is. |
| **2 — different language** | Java, Go, Ruby on Rails | The *design* (RLS-backstop tenancy, RBAC-as-a-pattern, webhook-driven billing sync), and — new in this revision — **the contract itself** (§7). A Java backend that correctly implements the certified API contract is just as composable with any frontend as a Node one. | Better Auth, Prisma/Drizzle, CASL, `packages/shared` — all TypeScript-only. Reimplemented per language using that ecosystem's own idiomatic tools. |

Tier 2 backends still earn composability *if they pass the contract suite* — crossing languages no
longer means "opt out of the composability story," it means "no shared code, but full contract
compatibility is still achievable and still the goal."

## 9. Directory layout

Backend and frontend become independent trees, not paired stacks:

```
backends/
  <backend-id>/         # e.g. nestjs, express, fastify, spring, go-gin, rails
    base/                # the api/ skeleton for this backend
    recipes/             # bundles (ORM+auth+tenancy+RBAC+billing) + categories, all backend-scoped
    contract/            # which contract version(s) this backend is certified against

frontends/
  <frontend-id>/         # e.g. react-vite, vue-vite, svelte-vite, solid-vite
    base/                # the app/ skeleton for this frontend
    recipes/             # UI-library categories + adapter recipes for backend-provided features
    contract/            # which contract version(s) this frontend targets
```

Phase 1's current `templates/base/` + `recipes/` become `backends/nestjs/{base,recipes}/` plus
`frontends/react-vite/{base,recipes}/` — relocated, not rewritten. `nestjs` and `react-vite` become
the reference implementations: every mechanism in `recipes/README.md` and
`docs-site/authoring-a-recipe.md` still applies unchanged *inside* either tree.

## 10. Engine implications

- **`discover.ts`/`apply.ts`/`inject.ts` still don't change.** A generation now resolves two
  `recipesDir`s (one per axis) instead of one, but each is walked and applied exactly as today.
- **`resolve.ts` needs one real, scoped extension, not zero changes** — being honest here rather
  than repeating Phase 1's "zero engine changes" framing where it no longer applies: a
  frontend-side adapter recipe needs to declare something like `requiresAnyOf` against a
  *backend-selected* bundle's id (e.g. "this ability-hook adapter requires whichever backend bundle
  provides CASL"), which means `requires`/`requiresAnyOf` checking has to span both resolved sets,
  not just one. This is the same shape of change `requiresAnyOf` itself was (small, additive), just
  crossing an axis boundary that didn't exist before.
- **CLI flow**: two new prompts — pick a backend, pick a frontend — replacing the single implicit
  choice of today. Both use the same conditional-prompt pattern already used for bundles
  (skip the prompt if only one option exists).
- **Naming**: the lesson already learned for bundle ids (`docs-site/authoring-a-recipe.md`,
  "Naming your recipe") applies to backend/frontend ids directly — keep `id` stable and technical,
  use `label` for what a human sees.

## 11. Candidate implementations (illustrative, not commitments)

| Backend candidates | Tier | Frontend candidates | Tier |
|---|---|---|---|
| `nestjs` (Phase 1, shipped) | 0 | `react-vite` (Phase 1, shipped) | 0 |
| `express`, `fastify` | 1 | `vue-vite`, `svelte-vite`, `solid-vite` | 1 |
| `spring` (Java), `go-gin` (Go), `rails` (Ruby) | 2 (§8) — contract-compatible per §7 regardless | — | — |

Any backend × any frontend from this table is a *valid* combination once both are certified against
the same contract version — there is no separate approval needed per pairing.

## 12. Testing & CI implications

- **The contract-conformance suite is the actual gate**, replacing "does this specific pairing work"
  with "does this backend pass the suite" and "does this frontend only touch documented endpoints."
  This is `test/golden-path.e2e-spec.ts` generalized, not a new invention.
- The golden-path CI job matrixes over: contract version × backend × (bundle within that backend) —
  frontend choice doesn't need its own matrix cell if the contract suite is the real gate; a
  frontend either only depends on the contract (verifiable via a lint/static check on its own API
  client) or it doesn't.
- A new backend or frontend implementation still needs the same live-verification rigor Phase 1
  established (`recipes/README.md`'s gotchas discipline) before being called done — passing the
  contract suite is necessary, not sufficient, the same way "typechecks" was never sufficient for
  Phase 1 either.

## 13. Open questions

- Exact shape of the contract artifact — hand-authored OpenAPI spec as source of truth (backend
  implementations generate their routes/docs from it) vs. generated from a reference backend and
  frozen as the spec other backends target? These have different discipline costs.
- How does a frontend's API client get generated/verified against the contract — hand-written and
  linted for compliance, or codegen'd from the OpenAPI spec (removing the chance of drift entirely)?
- Where do adapter recipes (§7) live — under the frontend they belong to, or in a separate
  `adapters/<feature>/<frontend-id>/` tree, since they logically depend on both a backend feature
  and a frontend framework?
- Governance: is a new backend/frontend a maintainer-only addition, or a real external-contribution
  surface? If the latter, passing the contract suite is presumably the acceptance bar — is that
  sufficient on its own, or does it still need the qualitative live-verification review Phase 1 had?
- Contract versioning policy — what happens when the contract needs a breaking change; do old
  backend/frontend implementations get deprecated, or does the generator need to support pinning a
  contract version per generated project?
