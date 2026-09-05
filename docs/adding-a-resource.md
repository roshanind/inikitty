# Adding a resource

This walks through adding a new tenant-scoped, RBAC-guarded, DTO-validated resource to a generated
project, using `Project` — the bundle's own worked example — as the reference. `Project` is meant
to be deleted and replaced with your first real resource; this doc is the pattern to follow when
you do.

Paths below are relative to a **generated project's** `api/` and `app/` directories (e.g.
`src/projects/` means `api/src/projects/`), not this generator's own repo.

## 1. Prisma model + RLS policy

Add the model to `api/prisma/schema.prisma`, with a real `@relation` to `Tenant` (not a raw
`tenantId` string with no relation — that workaround is only needed for models like `Membership`
that reference `User`, which gets overwritten by `npx auth generate` on every run; your own models
don't have that problem):

```prisma
model Project {
  id        String   @id @default(cuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name      String
  createdBy String
  createdAt DateTime @default(now())

  @@index([tenantId])
  @@map("project")
}
```

Add `projects Project[]` to the `Tenant` model's field list.

Then add its RLS policy to `api/prisma/enable-rls.sql`, right after the existing ones:

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

After editing the schema, regenerate and migrate:

```bash
npx prisma generate
npx prisma migrate dev --name add_project
```

## 2. DTOs

Three files per resource, in `src/projects/dto/`:

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
the class level, `@Expose()` per allowed field, is deny-by-default: a field added to the Prisma
model later doesn't leak to the client just because nobody remembered to mark it `@Exclude()`
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
`new ProjectResponseDto(project)` gets it filtered automatically. Returning the raw Prisma object
directly skips this entirely (class-transformer needs a real class instance to read the
`@Exclude`/`@Expose` metadata from), so always wrap.

## 3. Service — query through `TenantContext`, never the plain `PrismaService`

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Project } from '../generated/prisma/client';
import { TenantContext } from '../tenancy/tenant-context';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly tenantContext: TenantContext) {}

  async findAll(): Promise<Project[]> {
    const prisma = await this.tenantContext.getPrisma();
    return prisma.project.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string): Promise<Project> {
    const prisma = await this.tenantContext.getPrisma();
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException(`Project "${id}" not found.`);
    return project;
  }

  async create(dto: CreateProjectDto, createdBy: string): Promise<Project> {
    const [prisma, tenantId] = await Promise.all([
      this.tenantContext.getPrisma(),
      this.tenantContext.getTenantId(),
    ]);
    return prisma.project.create({ data: { name: dto.name, createdBy, tenantId } });
  }

  // update/remove follow the same shape — see api/src/projects/projects.service.ts.
}
```

`TenantContext.getPrisma()` returns a Prisma Client Extension that wraps every query in a
transaction setting the Postgres session variable RLS checks — `findUnique({ where: { id } })`
here can only ever see rows in the caller's own tenant, by construction. A missing row and a
cross-tenant row look identical (both 404) — that's intentional, it doesn't leak whether an id
exists in another tenant.

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
`defineAbilityFor()` — otherwise reuse `'Project'`-style subjects that already exist.

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

Register it in `src/app.module.ts`'s `imports` array (import + add to the array — `PrismaModule`
is `@Global()` so you don't need to import it explicitly).

## 6. Frontend — TanStack Query hooks

`app/src/features/<resource>/api.ts`:

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
