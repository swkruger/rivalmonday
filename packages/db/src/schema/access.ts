import { sql } from 'drizzle-orm';
import { foreignKey, index, check, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { contact } from './delivery';
import { agency, client } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Phase 5a decision 1: who may act for an agency, and over which clients. One row per user × agency × client scope.
 * Service role only (forced RLS, no policy): @cs/tools reads it through role-checked functions.
 */
export const membership = pgTable(
  'membership',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Better Auth user id (text) in auth."user"; FK added by migration 0035. */
    userId: text('user_id').notNull(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    /** Client roles only. */
    clientId: uuid('client_id'),
    /** Account managers only: assigned clients; NULL = every client of the agency. */
    clientScope: jsonb('client_scope').$type<string[] | null>(),
    /** Decision 5: the contact that receives this person's notifications. */
    contactId: uuid('contact_id').references(() => contact.id, { onDelete: 'set null' }),
    createdBy: text('created_by').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('membership_user_scope_unique').on(t.userId, t.agencyId, sql`coalesce(${t.clientId}, '00000000-0000-0000-0000-000000000000'::uuid)`),
    index('membership_agency_idx').on(t.agencyId),
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    check('membership_role_check', sql`role IN ('agency_admin', 'account_manager', 'client_owner', 'client_viewer')`),
    check('membership_role_scope_check', sql`(client_id IS NULL) = (role IN ('agency_admin', 'account_manager'))`),
    check('membership_client_scope_check', sql`client_scope IS NULL OR (role = 'account_manager' AND jsonb_typeof(client_scope) = 'array' AND jsonb_array_length(client_scope) > 0)`),
  ],
);

/** Phase 5a decision 2: a pending right to sign in and become a member. Service role only. */
export const invitation = pgTable(
  'invitation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').notNull(),
    clientId: uuid('client_id'),
    clientScope: jsonb('client_scope').$type<string[] | null>(),
    invitedBy: text('invited_by').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    acceptedAt: ts('accepted_at'),
    acceptedBy: text('accepted_by'),
    revokedAt: ts('revoked_at'),
  },
  (t) => [
    uniqueIndex('invitation_pending_unique')
      .on(t.agencyId, sql`coalesce(${t.clientId}, '00000000-0000-0000-0000-000000000000'::uuid)`, sql`lower(${t.email})`)
      .where(sql`accepted_at IS NULL AND revoked_at IS NULL`),
    index('invitation_email_idx').on(sql`lower(${t.email})`),
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    check('invitation_role_check', sql`role IN ('agency_admin', 'account_manager', 'client_owner', 'client_viewer')`),
    check('invitation_role_scope_check', sql`(client_id IS NULL) = (role IN ('agency_admin', 'account_manager'))`),
    check('invitation_client_scope_check', sql`client_scope IS NULL OR (role = 'account_manager' AND jsonb_typeof(client_scope) = 'array' AND jsonb_array_length(client_scope) > 0)`),
    check('invitation_email_check', sql`email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'`),
  ],
);
