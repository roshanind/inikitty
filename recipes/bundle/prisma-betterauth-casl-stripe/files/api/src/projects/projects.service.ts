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
    // RLS already filters other tenants' rows out entirely (not a 403 — they don't exist as far
    // as this query is concerned), so a missing row and a cross-tenant row look identical here:
    // both 404. That's intentional — it doesn't leak whether the id exists in another tenant.
    if (!project) {
      throw new NotFoundException(`Project "${id}" not found.`);
    }
    return project;
  }

  async create(dto: CreateProjectDto, createdBy: string): Promise<Project> {
    const [prisma, tenantId] = await Promise.all([
      this.tenantContext.getPrisma(),
      this.tenantContext.getTenantId(),
    ]);
    return prisma.project.create({ data: { name: dto.name, createdBy, tenantId } });
  }

  async update(id: string, dto: UpdateProjectDto): Promise<Project> {
    await this.findOne(id); // 404s before attempting the write if missing/cross-tenant
    const prisma = await this.tenantContext.getPrisma();
    return prisma.project.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    const prisma = await this.tenantContext.getPrisma();
    await prisma.project.delete({ where: { id } });
  }
}
