import { CanActivate, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { subscription } from '../db/schema';
import { TenantContext } from '../tenancy/tenant-context';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

/** Backs `@RequiresActiveSubscription()`. Queries through `TenantContext.withTenant()`, never the
 * plain `DbService`, per the tenancy convention — `subscription` is RLS-protected. */
@Injectable()
export class ActiveSubscriptionGuard implements CanActivate {
  constructor(private readonly tenantContext: TenantContext) {}

  async canActivate(): Promise<boolean> {
    const tenantId = await this.tenantContext.getTenantId();
    const row = await this.tenantContext.withTenant(async (db) => {
      const [row] = await db.select().from(subscription).where(eq(subscription.tenantId, tenantId)).limit(1);
      return row;
    });
    return row !== undefined && ACTIVE_STATUSES.has(row.status);
  }
}
