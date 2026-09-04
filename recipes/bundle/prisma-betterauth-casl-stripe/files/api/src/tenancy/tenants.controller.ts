import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from './tenant-context';

/**
 * Demonstrates the full tenancy chain end to end: session -> membership lookup -> tenant-scoped
 * response. The `Projects` resource (future work) is where the full DTO/response-class convention
 * from CLAUDE.md gets established for real CRUD resources — this is a single read-only endpoint,
 * so a hand-picked plain object (never the raw entity) is enough.
 */
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly prisma: PrismaService,
  ) {}

  @Get('me')
  async getCurrentTenant() {
    const [tenantId, role] = await Promise.all([
      this.tenantContext.getTenantId(),
      this.tenantContext.getRole(),
    ]);
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    return { tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug }, role };
  }
}
