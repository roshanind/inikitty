import type { MongoAbility } from '@casl/ability';
import type { Action } from './action.enum';

/**
 * Mirrors the API's Prisma-generated `MembershipRole` enum values as a plain literal union — this
 * package can't depend on the generated Prisma client (it's api-only, produced by `auth generate`
 * into `api/src/generated/`), so the two are declared independently. They're structurally
 * identical string unions, so `TenantContext.getRole()`'s return value passes into
 * `defineAbilityFor()` with no cast needed.
 */
export type MembershipRole = 'owner' | 'admin' | 'member';

/** Subjects abilities are defined over. Extend this union as new resources are added (e.g. once
 * Stripe billing lands). */
export type Subjects = 'Tenant' | 'Membership' | 'Project' | 'all';

export type AppAbility = MongoAbility<[Action, Subjects]>;
