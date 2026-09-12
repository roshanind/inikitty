import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TenantContext } from '../tenancy/tenant-context';
import { ProjectsService } from './projects.service';

/**
 * The reference unit test for a resource service — see docs/adding-a-resource.md. `TenantContext`
 * is mocked entirely; this never touches a real database, only proves `ProjectsService` calls
 * `withTenant()` (never a plain, unscoped db) the way it's supposed to. `withTenant` here is a
 * simple passthrough that hands the mock `db` builder straight to the callback — real tenant
 * isolation and RBAC enforcement are proven separately, against a real Postgres, by
 * `test/golden-path.e2e-spec.ts`.
 */
describe('ProjectsService', () => {
  let service: ProjectsService;

  const db = {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const tenantContext = {
    withTenant: jest.fn((fn: (db: unknown) => unknown) => fn(db)),
    getTenantId: jest.fn(),
  };

  function chain(result: unknown) {
    const builder: Record<string, jest.Mock> = {};
    ['from', 'where', 'orderBy', 'limit', 'values', 'set', 'returning'].forEach((method) => {
      builder[method] = jest.fn(() => builder);
    });
    // Terminal methods actually resolve when awaited (a real Drizzle query builder is a thenable).
    (builder as unknown as { then: typeof Promise.prototype.then }).then = (onFulfilled) =>
      Promise.resolve(result).then(onFulfilled as never);
    return builder;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    tenantContext.withTenant.mockImplementation((fn: (db: unknown) => unknown) => fn(db));
    tenantContext.getTenantId.mockResolvedValue('tenant-1');

    const moduleRef = await Test.createTestingModule({
      providers: [ProjectsService, { provide: TenantContext, useValue: tenantContext }],
    }).compile();

    service = moduleRef.get(ProjectsService);
  });

  it('findAll queries through the tenant-scoped db', async () => {
    db.select.mockReturnValue(chain([{ id: 'p1' }]));

    await expect(service.findAll()).resolves.toEqual([{ id: 'p1' }]);
    expect(tenantContext.withTenant).toHaveBeenCalled();
    expect(db.select).toHaveBeenCalled();
  });

  it('findOne throws NotFoundException when the row is missing or cross-tenant', async () => {
    db.select.mockReturnValue(chain([]));

    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('create stamps the current tenant and the given creator', async () => {
    db.insert.mockReturnValue(chain([{ id: 'p1' }]));

    await service.create({ name: 'New' }, 'user-1');

    expect(db.insert).toHaveBeenCalled();
    const valuesCall = db.insert.mock.results[0].value.values as jest.Mock;
    expect(valuesCall).toHaveBeenCalledWith({ name: 'New', createdBy: 'user-1', tenantId: 'tenant-1' });
  });

  it('update 404s before writing if the row is missing or cross-tenant', async () => {
    db.select.mockReturnValue(chain([]));

    await expect(service.update('missing', { name: 'x' })).rejects.toThrow(NotFoundException);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('remove 404s before deleting if the row is missing or cross-tenant', async () => {
    db.select.mockReturnValue(chain([]));

    await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    expect(db.delete).not.toHaveBeenCalled();
  });
});
