import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

// User/Session/Account/Verification tables are generated into ./auth-schema.ts by:
//   npx auth generate --yes
// Don't hand-edit that file — re-run the command after changing api/src/auth/auth.ts instead. Kept
// in a separate file (rather than appended below, the way Prisma's single schema.prisma is) since
// Drizzle's schema is plain TS modules, not one generator-annotated file — a dedicated generated
// file is the natural equivalent of Prisma's "don't hand-edit below this line" convention.

// Ids use Postgres's own gen_random_uuid() rather than a JS id-generation library (e.g.
// @paralleldrive/cuid2, which was tried first) — that package ships ESM-only, and Jest's CJS test
// runner can't load it even transitively (any unit test importing this schema file breaks with
// "Must use import to load ES Module"), the exact same class of bug documented for
// @thallesp/nestjs-better-auth elsewhere in this bundle. Using a native Postgres default sidesteps
// the whole problem instead of adding another jestModuleNameMapper workaround.
const uuidPk = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);

export const membershipRole = pgEnum('membership_role', ['owner', 'admin', 'member']);

export const subscriptionStatus = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused',
]);

export const tenant = pgTable('tenant', {
  id: uuidPk(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  // Nullable — only set once the tenant's first Checkout session succeeds. Not RLS-protected:
  // tenant is the scope boundary itself, not scoped data (see CLAUDE.md's tenancy notes).
  stripeCustomerId: text('stripeCustomerId').unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
});

// One row per tenant (v1 assumes a single plan per tenant, not add-ons/multiple subscriptions).
// Unlike membership, this has a real `references()` FK to tenant — tenant isn't owned/overwritten
// by `auth generate` the way user is, so there's no back-relation-survives-regeneration problem to
// work around with a raw-SQL FK here (see membership below).
export const subscription = pgTable('subscription', {
  id: uuidPk(),
  tenantId: uuid('tenantId')
    .notNull()
    .unique()
    .references(() => tenant.id, { onDelete: 'cascade' }),
  stripeSubscriptionId: text('stripeSubscriptionId').notNull().unique(),
  priceId: text('priceId').notNull(),
  status: subscriptionStatus('status').notNull(),
  currentPeriodEnd: timestamp('currentPeriodEnd').notNull(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
});

// `userId` deliberately has no Drizzle `references()` to the generated `user` table: that table is
// entirely owned/overwritten by `npx auth generate` on every run, and Drizzle (like Prisma) can't
// portably declare a schema-level FK into a file it doesn't control without risking it vanishing on
// regenerate. Real referential integrity (a Postgres FK to "user") is added via raw SQL in the
// enable-rls migration instead; application code queries by the plain `userId` column.
export const membership = pgTable(
  'membership',
  {
    id: uuidPk(),
    // References the generated `user` table's own id column, which is text (Better Auth's default
    // id shape), not uuid — hence text here too, despite every other id in this file being uuid.
    userId: text('userId').notNull(),
    tenantId: uuid('tenantId')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    role: membershipRole('role').notNull().default('member'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.tenantId), index().on(table.userId)],
);

// The canonical worked example (see docs/adding-a-resource.md): tenant-scoped, RBAC-guarded,
// DTO-validated, with FE list/create/detail pages. Delete this table (and api/src/projects/,
// app/src/features/projects/) and copy the pattern for real resources.
//
// `createdBy` is a plain userId column, not a references() FK to user, for the same
// auth-generate-ownership reason as membership.userId above.
export const project = pgTable(
  'project',
  {
    id: uuidPk(),
    tenantId: uuid('tenantId')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdBy: text('createdBy').notNull(),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => [index().on(table.tenantId)],
);
