import { CanActivate, Injectable } from '@nestjs/common';
import { TenantContext } from '../tenancy/tenant-context';

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

/** Backs `@RequiresActiveSubscription()`. Queries through `TenantContext`'s tenant-scoped client,
 * never the plain `PrismaService`, per the tenancy convention — `subscription` is RLS-protected. */
@Injectable()
export class ActiveSubscriptionGuard implements CanActivate {
  constructor(private readonly tenantContext: TenantContext) {}

  async canActivate(): Promise<boolean> {
    const [tenantId, prisma] = await Promise.all([
      this.tenantContext.getTenantId(),
      this.tenantContext.getPrisma(),
    ]);
    const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
    return subscription !== null && ACTIVE_STATUSES.has(subscription.status);
  }
}
