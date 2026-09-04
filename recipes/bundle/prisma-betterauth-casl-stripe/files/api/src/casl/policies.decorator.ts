import { SetMetadata } from '@nestjs/common';
import type { AppAbility } from '{{projectNameKebab}}-shared';

export const CHECK_POLICIES_KEY = 'check_policy';
export type PolicyHandler = (ability: AppAbility) => boolean;

/** Declares the CASL rule(s) a route requires; enforced by `PoliciesGuard`. */
export const CheckPolicies = (...handlers: PolicyHandler[]) =>
  SetMetadata(CHECK_POLICIES_KEY, handlers);
