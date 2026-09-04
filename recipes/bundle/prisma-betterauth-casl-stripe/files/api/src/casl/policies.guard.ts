import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { defineAbilityFor } from '{{projectNameKebab}}-shared';
import { TenantContext } from '../tenancy/tenant-context';
import { CHECK_POLICIES_KEY, PolicyHandler } from './policies.decorator';

/**
 * Registered globally (see `CaslModule`). Routes with no `@CheckPolicies()` are allowed through
 * unchanged — the global Better Auth `AuthGuard` already requires a session; this guard only adds
 * role-based authorization on top for routes that opt in.
 */
@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handlers =
      this.reflector.get<PolicyHandler[]>(CHECK_POLICIES_KEY, context.getHandler()) ?? [];
    if (handlers.length === 0) return true;

    const ability = defineAbilityFor(await this.tenantContext.getRole());
    return handlers.every((handler) => handler(ability));
  }
}
