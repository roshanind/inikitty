import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import { Action } from './action.enum';
import type { AppAbility, MembershipRole } from './subjects';

/**
 * Tenant-aware by construction: callers pass the role the user holds *within the active tenant*
 * (e.g. `TenantContext.getRole()` on the API side), never a global role, so the resulting ability
 * only ever reflects permissions inside that one tenant.
 */
export function defineAbilityFor(role: MembershipRole): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  switch (role) {
    case 'owner':
      can(Action.Manage, 'all');
      break;
    case 'admin':
      can(Action.Manage, 'Project');
      can(Action.Read, ['Tenant', 'Membership']);
      break;
    case 'member':
      can(Action.Read, 'Project');
      can(Action.Create, 'Project');
      break;
  }

  return build();
}
