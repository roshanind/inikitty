import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TenantContext } from '../tenancy/tenant-context';
import { ProjectsService } from './projects.service';

/**
 * The reference unit test for a resource service — see docs/adding-a-resource.md. `TenantContext`
 * is mocked entirely; this never touches a real database, only proves `ProjectsService` calls the
 * tenant-scoped client (never the plain `PrismaService`) the way it's supposed to. Real tenant
 * isolation and RBAC enforcement are proven separately, against a real Postgres, by
 * `test/golden-path.e2e-spec.ts`.
 */
describe('ProjectsService', () => {
  let service: ProjectsService;

  const prisma = {
    project: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const tenantContext = {
    getPrisma: jest.fn(),
    getTenantId: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tenantContext.getPrisma.mockResolvedValue(prisma);
    tenantContext.getTenantId.mockResolvedValue('tenant-1');

    const moduleRef = await Test.createTestingModule({
      providers: [ProjectsService, { provide: TenantContext, useValue: tenantContext }],
    }).compile();

    service = moduleRef.get(ProjectsService);
  });

  it('findAll queries through the tenant-scoped client', async () => {
    prisma.project.findMany.mockResolvedValue([{ id: 'p1' }]);

    await expect(service.findAll()).resolves.toEqual([{ id: 'p1' }]);
    expect(prisma.project.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } });
  });

  it('findOne throws NotFoundException when the row is missing or cross-tenant', async () => {
    prisma.project.findUnique.mockResolvedValue(null);

    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('create stamps the current tenant and the given creator', async () => {
    prisma.project.create.mockResolvedValue({ id: 'p1' });

    await service.create({ name: 'New' }, 'user-1');

    expect(prisma.project.create).toHaveBeenCalledWith({
      data: { name: 'New', createdBy: 'user-1', tenantId: 'tenant-1' },
    });
  });

  it('update 404s before writing if the row is missing or cross-tenant', async () => {
    prisma.project.findUnique.mockResolvedValue(null);

    await expect(service.update('missing', { name: 'x' })).rejects.toThrow(NotFoundException);
    expect(prisma.project.update).not.toHaveBeenCalled();
  });

  it('remove 404s before deleting if the row is missing or cross-tenant', async () => {
    prisma.project.findUnique.mockResolvedValue(null);

    await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    expect(prisma.project.delete).not.toHaveBeenCalled();
  });
});
