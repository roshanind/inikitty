import { CanActivate, ExecutionContext, Injectable, Scope } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { defineAbilityFor } from '{{projectNameKebab}}-shared';
import { TenantContext } from '../tenancy/tenant-context';
import { CHECK_POLICIES_KEY, PolicyHandler } from './policies.decorator';

/**
 * Registered globally (see `CaslModule`). Routes with no `@CheckPolicies()` are allowed through
 * unchanged — the global Better Auth `AuthGuard` already requires a session; this guard only adds
 * role-based authorization on top for routes that opt in.
 *
 * `scope: Scope.REQUEST` is required, not optional, here: Nest's automatic scope-bubbling (a
 * provider that injects a request-scoped dependency becomes request-scoped itself) does not
 * reliably extend to enhancers registered globally via `APP_GUARD`. Without this, Nest
 * instantiates a single guard instance at bootstrap *before* any request exists, so
 * `TenantContext` never gets a real instance — every request's `this.reflector`/`this.tenantContext`
 * come back `undefined`, not a DI resolution error, so it fails as a silent 500 at request time,
 * not at startup. Verified live: removing this line reproduces exactly that failure.
 */
@Injectable({ scope: Scope.REQUEST })
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
