import { useQuery } from '@tanstack/react-query';
import { defineAbilityFor, type AppAbility, type MembershipRole } from '{{projectNameKebab}}-shared';
import { apiFetch } from './api-client';

interface TenantMe {
  tenant: { id: string; name: string; slug: string };
  role: MembershipRole;
}

/**
 * The isomorphic payoff of `packages/shared`: the exact same `defineAbilityFor()` the API's
 * `PoliciesGuard` uses, driven by the same `GET /tenants/me` the tenancy slice already exposes —
 * so a `member` sees the same permissions client-side (e.g. no Delete button) as the API would
 * actually enforce, with no separate FE-side rule set to keep in sync by hand.
 */
export function useAbility(): AppAbility | undefined {
  const { data } = useQuery({
    queryKey: ['tenants', 'me'],
    queryFn: () => apiFetch<TenantMe>('/tenants/me'),
  });
  return data ? defineAbilityFor(data.role) : undefined;
}
