# Adding a resource

This walks through adding a new tenant-scoped, RBAC-guarded, DTO-validated resource to a generated
project, using `Project` — the bundle's own worked example — as the reference. `Project` is meant
to be deleted and replaced with your first real resource; this doc is the pattern to follow when
you do.

Paths below are relative to a **generated project's** `api/` and `app/` directories (e.g.
`src/projects/` means `api/src/projects/`), not this generator's own repo.

## 1. Drizzle table + RLS policy

Add the table to `api/src/db/schema.ts`, with a real `references()` FK to `tenant` (not a raw
`tenantId` column with no reference — that workaround is only needed for tables like `membership`
that reference the generated `user` table, which gets overwritten by `npx auth generate` on every
run; your own tables don't have that problem):

```ts
export const project = pgTable(
  'project',
  {
    id: text('id').primaryKey().$defaultFn(() => createId()),
    tenantId: text('tenantId').notNull().references(() => tenant.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdBy: text('createdBy').notNull(),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => [index().on(table.tenantId)],
);
```

Then add its RLS policy to `api/src/db/enable-rls.sql`, right after the existing ones:

```sql
ALTER TABLE "project" ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_tenant_isolation ON "project"
  USING ("tenantId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
```

One `USING`/`WITH CHECK` branch is enough for a normal resource — the two-branch shape
`membership`'s policy has exists only to solve `TenantContext`'s own bootstrap problem (looking up
"which tenant do I belong to" before a tenant is known). Your resource is only ever queried once a
tenant is already established, so it doesn't need that escape hatch.

After editing the schema, generate and apply a migration:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

## 2. DTOs

Three files per resource, in `src/projects/dto/` — identical to the Prisma bundle's convention,
since DTOs describe the wire shape, not the ORM:

**`create-project.dto.ts`** — validates the request body:

```ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}
```

**`update-project.dto.ts`** — every field optional, via `PartialType`:

```ts
import { PartialType } from '@nestjs/swagger';
import { CreateProjectDto } from './create-project.dto';

export class UpdateProjectDto extends PartialType(CreateProjectDto) {}
```

**`project-response.dto.ts`** — controls what actually serializes to the client. `@Exclude()` at
the class level, `@Expose()` per allowed field, is deny-by-default: a column added to the schema
later doesn't leak to the client just because nobody remembered to mark it `@Exclude()`
individually.

```ts
import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class ProjectResponseDto {
  @Expose()
  id!: string;

  @Expose()
  name!: string;

  @Expose()
  createdBy!: string;

  @Expose()
  createdAt!: Date;

  constructor(partial: ProjectResponseDto) {
    Object.assign(this, partial);
  }
}
```

`ClassSerializerInterceptor` is already registered globally (`main.ts`) — a controller returning
`new ProjectResponseDto(project)` gets it filtered automatically. Returning the raw Drizzle row
directly skips this entirely (class-transformer needs a real class instance to read the
`@Exclude`/`@Expose` metadata from), so always wrap.

## 3. Service — query through `TenantContext.withTenant()`, never the plain `DbService`

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { project } from '../db/schema';
import { TenantContext } from '../tenancy/tenant-context';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly tenantContext: TenantContext) {}

  async findAll() {
    return this.tenantContext.withTenant((db) => db.select().from(project).orderBy(desc(project.createdAt)));
  }

  async findOne(id: string) {
    const row = await this.tenantContext.withTenant(async (db) => {
      const [row] = await db.select().from(project).where(eq(project.id, id)).limit(1);
      return row;
    });
    if (!row) throw new NotFoundException(`Project "${id}" not found.`);
    return row;
  }

  async create(dto: CreateProjectDto, createdBy: string) {
    const tenantId = await this.tenantContext.getTenantId();
    const [row] = await this.tenantContext.withTenant((db) =>
      db.insert(project).values({ name: dto.name, createdBy, tenantId }).returning(),
    );
    return row;
  }

  // update/remove follow the same shape — see api/src/projects/projects.service.ts.
}
```

`TenantContext.withTenant(fn)` runs `fn` inside a transaction that first sets the Postgres session
variable RLS checks — `db.select().from(project).where(eq(project.id, id))` here can only ever see
rows in the caller's own tenant, by construction. A missing row and a cross-tenant row look
identical (both 404) — that's intentional, it doesn't leak whether an id exists in another tenant.

This is the one place this bundle's shape differs most from the Prisma bundle's: Prisma's
`TenantContext.getPrisma()` returns an already-scoped client you call `.project.findMany()` on
directly, because Prisma's Client Extensions can hook into every query automatically. Drizzle has
no equivalent hook, so `withTenant()` takes a callback instead — the same "can't forget to scope by
tenant" guarantee, just shaped around Drizzle's own transaction-callback idiom.

## 4. Controller — `@CheckPolicies()` per route

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UnauthorizedException } from '@nestjs/common';
import { Action } from '{{projectNameKebab}}-shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { CheckPolicies } from '../casl/policies.decorator';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @CheckPolicies((ability) => ability.can(Action.Read, 'Project'))
  async findAll(): Promise<ProjectResponseDto[]> {
    const projects = await this.projectsService.findAll();
    return projects.map((project) => new ProjectResponseDto(project));
  }

  @Post()
  @CheckPolicies((ability) => ability.can(Action.Create, 'Project'))
  async create(@Body() dto: CreateProjectDto, @CurrentUser() user: { id: string } | null) {
    if (!user) throw new UnauthorizedException();
    const project = await this.projectsService.create(dto, user.id);
    return new ProjectResponseDto(project);
  }

  // findOne/update/remove — same shape, see api/src/projects/projects.controller.ts.
}
```

No `@CheckPolicies()` means the route is allowed through once authenticated (the global
`AuthGuard` already requires a session) — only add it where a route needs role-gating beyond "any
signed-in member of this tenant." If the resource introduces a genuinely new permission concept
(the way billing's `Subscription` subject did), add it to `Subjects` in
`packages/shared/src/casl/subjects.ts` and give it real rules in `ability.factory.ts`'s
`defineAbilityFor()` — otherwise reuse `'Project'`-style subjects that already exist. This whole
layer is identical to the Prisma bundle's — CASL doesn't know or care which ORM is underneath it.

## 5. Module + registration

```ts
import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [TenancyModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
```

Register it in `src/app.module.ts`'s `imports` array (import + add to the array — `DbModule`
is `@Global()` so you don't need to import it explicitly).

## 6. Frontend — TanStack Query hooks

Identical to the Prisma bundle — the frontend never talks to the ORM. `app/src/features/<resource>/api.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api-client';

export interface Project {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

const projectsKey = ['projects'] as const;

export function useProjects() {
  return useQuery({ queryKey: projectsKey, queryFn: () => apiFetch<Project[]>('/projects') });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => apiFetch<Project>('/projects', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectsKey }),
  });
}
```

## 7. Frontend — pages, gated by the same CASL rules the API enforces

`useAbility()` (`app/src/lib/use-ability.ts`) calls the *same* `defineAbilityFor()` from
`packages/shared` that `PoliciesGuard` uses server-side, driven by `GET /tenants/me`'s role. This
is the isomorphic payoff: a `member` sees no "Delete" button not because of a separately
hand-maintained FE permission check, but because it's the identical rule the API would enforce
anyway.

```tsx
import { Action } from '{{projectNameKebab}}-shared';
import { useAbility } from '../../lib/use-ability';
import { useProjects } from './api';

export function ProjectsListPage() {
  const { data: projects } = useProjects();
  const ability = useAbility();

  return (
    <main>
      {ability?.can(Action.Create, 'Project') && <CreateProjectForm />}
      <ul>{projects?.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
    </main>
  );
}
```

Add routes for the new pages inside `app/src/App.tsx`'s existing `<Routes>` — a fresh generated
project already has that wrapper wired up by this bundle's `App.tsx.inject/routes-open.tsx` /
`routes-close.tsx` snippets; a real resource just adds more `<Route>` entries alongside the
existing `/projects` and `/projects/:id` ones. Pages needing a session should wrap their route's
`element` in `<RequireAuth>` (`app/src/features/auth/RequireAuth.tsx`), same as the existing
Projects routes do.

## 8. Tests

Follow `src/projects/projects.service.spec.ts`'s shape for a new service: mock `TenantContext`
entirely (`withTenant` as a jest mock that just calls its callback with a fake query-builder
object, `getTenantId` returning a fixed string), and assert the service calls `withTenant()` the
way it's supposed to — no real database involved. Mocking Drizzle's chainable query builder is more
verbose than mocking Prisma's flat `.project.findMany()` calls (see the existing spec's `chain()`
helper) — that verbosity is itself one of this bundle's real, documented tradeoffs versus Prisma.

For the real signup → tenancy → RBAC flow, extend `test/golden-path.e2e-spec.ts` rather than
writing a parallel e2e file — it already spawns the real compiled server and handles the
sign-up/verify/sign-in boilerplate; add your resource's own CRUD/cross-tenant/RBAC assertions
inside its existing `describe` block (or a new one in the same file) so `pnpm test:e2e` still
exercises everything as one coherent flow.

## What to double-check before shipping a new resource

- **Cross-tenant isolation**: sign up two separate users (two separate tenants), confirm tenant B
  can't read/list tenant A's rows and gets a 404 (not a 403, not a data leak) hitting tenant A's id
  directly.
- **RBAC**: confirm each role actually gets what `defineAbilityFor()` says it should — the guard
  enforcing this (`PoliciesGuard`) is a **request-scoped** provider (`@Injectable({ scope:
  Scope.REQUEST })`) precisely because it depends on the request-scoped `TenantContext`; if you
  ever add another CASL-consuming global guard, it needs the same scope annotation or it silently
  gets constructed once at bootstrap with no real dependencies (`this.tenantContext` ends up
  `undefined`, not a DI error — it only fails once a request actually calls a guarded route).
- **DTO shape**: hit the endpoint and confirm the response really doesn't include anything you
  didn't `@Expose()` — a missing `@Expose()` fails silently (the field just doesn't show up), not
  loudly.
