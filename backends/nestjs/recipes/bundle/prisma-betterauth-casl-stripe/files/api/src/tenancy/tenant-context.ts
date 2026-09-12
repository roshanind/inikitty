import { Inject, Injectable, NotFoundException, Scope, UnauthorizedException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { UserSession } from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import type { MembershipRole } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { forTenant, forUser } from './tenant.extension';

interface ResolvedTenant {
  tenantId: string;
  role: MembershipRole;
}

/**
 * Resolves the current request's tenant the way §7.2 of the product-scope doc intends but not
 * literally: there's no JWT claim carrying a tenant_id (our session isn't a raw JWT — see
 * CLAUDE.md's auth design notes), so this looks the membership up per request instead, via
 * `Membership.findFirst({ where: { userId } })`. That's the deliberate v1 simplification: a user
 * with more than one membership always resolves to their oldest one. Switching between multiple
 * memberships is a known, documented gap, not built yet.
 *
 * Request-scoped so each request gets its own resolution and its own tenant-scoped Prisma client
 * — exactly the "request-scoped provider" the doc describes.
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantContext {
  private resolution?: Promise<ResolvedTenant>;

  constructor(
    @Inject(REQUEST) private readonly request: Request & { session?: UserSession | null },
    private readonly prisma: PrismaService,
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
    // Uses `forUser`, not `forTenant` — the tenant isn't known yet, that's what this call is
    // figuring out. See tenant.extension.ts for why the RLS policy allows this specific lookup.
    const membership = await this.prisma
      .$extends(forUser(userId))
      .membership.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
    if (!membership) {
      throw new NotFoundException('No tenant membership found for the current user.');
    }
    return { tenantId: membership.tenantId, role: membership.role };
  }

  async getTenantId(): Promise<string> {
    return (await this.resolve()).tenantId;
  }

  async getRole(): Promise<MembershipRole> {
    return (await this.resolve()).role;
  }

  /** The tenant-scoped Prisma client — every query through this is automatically RLS-filtered. */
  async getPrisma() {
    const { tenantId } = await this.resolve();
    return this.prisma.$extends(forTenant(tenantId));
  }
}
