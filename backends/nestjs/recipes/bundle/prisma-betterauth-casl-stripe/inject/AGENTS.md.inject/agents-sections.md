## Stack

Auth (Better Auth, cookie sessions), multi-tenancy (Postgres row-level security), RBAC (CASL),
billing (Stripe), and one worked-example resource (`Projects`) are wired end to end — this isn't a
skeleton with dependencies listed, `POST /auth/sign-up/email` → tenant-scoped, RBAC-guarded
`GET /projects` actually works today. UI is Material UI (`app/src/theme.ts`).

## Directory responsibilities (`api/src/`)

- `auth/` — Better Auth config (`auth.ts`) and the `@CurrentUser()` decorator. Auth routes are
  Better Auth's own (`POST /auth/sign-up/email`, `POST /auth/sign-in/email`,
  `GET /auth/get-session`, ...) under `basePath: '/auth'` — never wrapped or renamed.
- `tenancy/` — `TenantContext` (request-scoped; resolves the caller's tenant + role) and
  `tenant.extension.ts` (`forTenant()`/`forUser()`, the Prisma Client Extensions that make RLS
  actually apply). `TenantsController`'s `GET /tenants/me` is the reference for reading both.
- `casl/` — `PoliciesGuard` (global) + `@CheckPolicies()` decorator. Ability rules themselves live
  in `packages/shared/src/casl/`, not here — see "RBAC" below.
- `billing/` — Stripe Checkout/Portal session creation, the signature-verified webhook, and
  `@RequiresActiveSubscription()`.
- `projects/` — the worked example. Copy this shape for every new resource (see
  `docs/adding-a-resource.md` for the full walkthrough).
- `generated/prisma/` — the Prisma client. Never hand-edit; regenerate with `npx prisma generate`.

## The tenancy rule (hard constraint)

**Every query on a tenant-scoped table (`membership`, `subscription`, `project`, and any table you
add) must go through `TenantContext`'s scoped client — never the plain `PrismaService`, and never
raw `prisma.<table>` calls.**

```ts
// Wrong — bypasses RLS entirely, will return every tenant's rows:
const projects = await this.prismaService.project.findMany();

// Right:
const prisma = await this.tenantContext.getPrisma();
const projects = await prisma.project.findMany();
```

`TenantContext.getPrisma()` wraps the query in a transaction that sets the Postgres session
variable the RLS policy checks — this is the actual enforcement mechanism, not a convention Prisma
happens to also apply automatically. The one legitimate exception is code with no request context
at all (the Stripe webhook, the signup hook) — those call `forTenant(tenantId)` directly with a
`tenantId` they already know, from `packages/shared/src/tenancy` equivalents in `api/src/tenancy/tenant.extension.ts`.

Runtime code must connect via `APP_DATABASE_URL` (the `app_role`, subject to RLS), never
`DATABASE_URL` (the migration-only superuser — bypasses RLS unconditionally). `PrismaService` and
`auth.ts` already do this correctly; don't introduce a second Prisma client that doesn't.

## RBAC convention

`@CheckPolicies()` on a controller method, checked against ability rules defined once in
`packages/shared/src/casl/ability.factory.ts` (shared, unmodified, with the frontend):

```ts
@Delete(':id')
@CheckPolicies((ability) => ability.can(Action.Delete, 'Project'))
async remove(@Param('id') id: string) { ... }
```

No `@CheckPolicies()` means "any authenticated member of this tenant" (the global `AuthGuard`
already requires a session) — only add it where a route needs role-gating beyond that. Real
example: `member` can `Read`/`Create` a `Project` but not `Update`/`Delete` it —
`api/src/projects/projects.controller.ts` is the reference. If you add a global guard/interceptor
that depends on a request-scoped provider (like `TenantContext`), it must be
`@Injectable({ scope: Scope.REQUEST })` itself — see `PoliciesGuard` for why, and the comment in
`api/src/casl/policies.guard.ts`.

## DTO convention

Never return a Prisma entity directly. Per resource: `CreateXDto` (validated with
class-validator), `UpdateXDto` (`PartialType(CreateXDto)`), `XResponseDto` (class-level
`@Exclude()`, per-field `@Expose()` — deny-by-default). `ClassSerializerInterceptor` is registered
globally (`main.ts`); a controller returning `new XResponseDto(entity)` gets it filtered
automatically — returning the raw entity skips that filtering entirely. See
`api/src/projects/dto/` for the reference shape.

## Testing

`pnpm test` (unit, `*.spec.ts` — mock `TenantContext`, no real database) and `pnpm test:e2e`
(`test/*.e2e-spec.ts` — spawns the real compiled server via `node dist/main.js` and drives real
HTTP requests against a real Postgres; requires `docker compose up -d` and migrations already
applied, then `pnpm build` first). `test/golden-path.e2e-spec.ts` is the reference for the
signup → session → CRUD → cross-tenant → RBAC flow — extend it for new resources rather than
writing a parallel e2e file.

## Adding a new resource

See [`docs/adding-a-resource.md`](docs/adding-a-resource.md) for the full walkthrough, using
`Projects` as the worked example.

## Guardrails specific to this stack

- Never query a tenant-scoped table through the plain `PrismaService` — always
  `TenantContext.getPrisma()` (or `forTenant(tenantId)` directly when no request context exists).
- Never connect application code to `DATABASE_URL` — that's the migration-only superuser and
  unconditionally bypasses row-level security. Runtime code uses `APP_DATABASE_URL`.
- Never duplicate CASL ability rules inside `app/` — import `defineAbilityFor()` from
  `{{projectNameKebab}}-shared` (see `app/src/lib/use-ability.ts`) so the frontend can never drift
  from what the API actually enforces.
- Never mark a new globally-registered guard/interceptor without `Scope.REQUEST` if it depends on
  `TenantContext` — it will silently no-op (not error) at request time. See `PoliciesGuard`.
