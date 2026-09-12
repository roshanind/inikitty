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
    // RLS already filters other tenants' rows out entirely (not a 403 — they don't exist as far
    // as this query is concerned), so a missing row and a cross-tenant row look identical here:
    // both 404. That's intentional — it doesn't leak whether the id exists in another tenant.
    if (!row) {
      throw new NotFoundException(`Project "${id}" not found.`);
    }
    return row;
  }

  async create(dto: CreateProjectDto, createdBy: string) {
    const tenantId = await this.tenantContext.getTenantId();
    const [row] = await this.tenantContext.withTenant((db) =>
      db.insert(project).values({ name: dto.name, createdBy, tenantId }).returning(),
    );
    return row;
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.findOne(id); // 404s before attempting the write if missing/cross-tenant
    const [row] = await this.tenantContext.withTenant((db) =>
      db.update(project).set(dto).where(eq(project.id, id)).returning(),
    );
    return row;
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.tenantContext.withTenant((db) => db.delete(project).where(eq(project.id, id)));
  }
}
