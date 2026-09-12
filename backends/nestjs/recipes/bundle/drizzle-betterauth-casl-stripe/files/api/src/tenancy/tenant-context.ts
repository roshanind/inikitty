import { Inject, Injectable, NotFoundException, Scope, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import { asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Request } from 'express';
import { DbService } from '../db/db.service';
import { membership, type membershipRole } from '../db/schema';
import type * as schema from '../db/schema';
import { withTenant, withUser } from './tenant.extension';

type Db = NodePgDatabase<typeof schema>;
type MembershipRole = (typeof membershipRole.enumValues)[number];

interface ResolvedTenant {
  tenantId: string;
  role: MembershipRole;
}

/**
 * Resolves the current request's tenant the way §7.2 of the product-scope doc intends but not
 * literally: there's no JWT claim carrying a tenant_id (our session isn't a raw JWT — see
 * CLAUDE.md's auth design notes), so this looks the membership up per request instead, ordering by
 * `createdAt` ascending and taking the first row. That's the deliberate v1 simplification: a user
 * with more than one membership always resolves to their oldest one. Switching between multiple
 * memberships is a known, documented gap, not built yet.
 *
 * Request-scoped so each request gets its own resolution — exactly the "request-scoped provider"
 * the doc describes.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  private resolution?: Promise<ResolvedTenant>;

  constructor(
    @Inject(REQUEST) private readonly request: Request & { session?: UserSession | null },
    private readonly dbService: DbService,
  ) {}

  private get userId(): string {
    const userId = this.request.session?.user?.id;
    if (!userId) {
      throw new UnauthorizedException('No authenticated session.');
    }
    return userId;
  }

  private resolve(): Promise<ResolvedTenant> {
    if (!this.resolution) {
      this.resolution = this.doResolve();
    }
    return this.resolution;
  }

  private async doResolve(): Promise<ResolvedTenant> {
    const userId = this.userId;
    // Uses `withUser`, not `withTenant` — the tenant isn't known yet, that's what this call is
    // figuring out. See tenant.extension.ts for why the RLS policy allows this specific lookup.
    const [row] = await withUser(this.dbService.db, userId, (tx) =>
      tx
        .select({ tenantId: membership.tenantId, role: membership.role })
        .from(membership)
        .where(eq(membership.userId, userId))
        .orderBy(asc(membership.createdAt))
        .limit(1),
    );
    if (!row) {
      throw new NotFoundException('No tenant membership found for the current user.');
    }
    return { tenantId: row.tenantId, role: row.role };
  }

  async getTenantId(): Promise<string> {
    return (await this.resolve()).tenantId;
  }

  async getRole(): Promise<MembershipRole> {
    return (await this.resolve()).role;
  }

  /**
   * Runs `fn` against the tenant-scoped db — every query inside it is automatically RLS-filtered.
   * The Prisma bundle's equivalent (`getPrisma()`) returns a client callers query directly;
   * Drizzle has no per-query middleware to hook a `$extends`-style client together, so this takes a
   * callback instead — same "can't forget to scope by tenant" guarantee, just shaped around
   * Drizzle's transaction-callback idiom rather than a wrapped client object.
   */
  async withTenant<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    const { tenantId } = await this.resolve();
    return withTenant(this.dbService.db, tenantId, fn);
  }
}
