import { Controller, Get, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DbService } from '../db/db.service';
import { tenant } from '../db/schema';
import { TenantContext } from './tenant-context';

/**
 * Demonstrates the full tenancy chain end to end: session -> membership lookup -> tenant-scoped
 * response. The `Projects` resource (future work) is where the full DTO/response-class convention
 * from CLAUDE.md gets established for real CRUD resources — this is a single read-only endpoint,
 * so a hand-picked plain object (never the raw row) is enough.
 */
@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly dbService: DbService,
  ) {}

  @Get('me')
  async getCurrentTenant() {
    const [tenantId, role] = await Promise.all([
      this.tenantContext.getTenantId(),
      this.tenantContext.getRole(),
    ]);
    // `tenant` itself isn't RLS-protected (it's the scope boundary, not scoped data — see
    // CLAUDE.md's tenancy notes), so this reads through the plain db, not withTenant().
    const [row] = await this.dbService.db.select().from(tenant).where(eq(tenant.id, tenantId)).limit(1);
    if (!row) {
      throw new NotFoundException(`Tenant "${tenantId}" not found.`);
    }
    return { tenant: { id: row.id, name: row.name, slug: row.slug }, role };
  }
}
