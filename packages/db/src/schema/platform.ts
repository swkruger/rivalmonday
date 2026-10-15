import { sql } from 'drizzle-orm';
import { check, date, index, integer, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { agency } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Phase 8a: platform operators (owner | staff | viewer). Service role only (forced RLS, no policy, nothing for app_user).
 * `user_id` FK to auth."user" is added by the custom migration (same as membership).
 */
export const platformAdmin = pgTable(
  'platform_admin',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    role: text('role').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    /** Auth user id or 'cli'. */
    createdBy: text('created_by'),
    revokedAt: ts('revoked_at'),
  },
  (t) => [
    uniqueIndex('platform_admin_active_user_uq').on(t.userId).where(sql`${t.revokedAt} IS NULL`),
    check('platform_admin_role_check', sql`role IN ('owner', 'staff', 'viewer')`),
  ],
);

/** Phase 8a: nightly per-agency figures for one UTC day. NULL = not measured, 0 = measured zero. Service role only. */
export const agencyDailyStat = pgTable(
  'agency_daily_stat',
  {
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    clientsActive: integer('clients_active'),
    clientsProspect: integer('clients_prospect'),
    agencySeats: integer('agency_seats'),
    clientSeats: integer('client_seats'),
    /** Phase 9b: agency-to-client billing MRR (cents) via Connect. */
    clientMrrCents: integer('client_mrr_cents'),
    /** Distinct users with a session created or refreshed (greatest(createdAt, updatedAt)) in (day-6 .. day). */
    wau: integer('wau'),
    briefsSent: integer('briefs_sent'),
    alertsSent: integer('alerts_sent'),
    prospectReports: integer('prospect_reports'),
    askQuestions: integer('ask_questions'),
    mcpCalls: integer('mcp_calls'),
    /** numeric(12,4); returned as a string (drizzle numeric default) - parse where read. */
    spendUsd: numeric('spend_usd', { precision: 12, scale: 4 }),
    lastActivityAt: ts('last_activity_at'),
    /** Phase 9a: NULL before billing existed. */
    mrrCents: integer('mrr_cents'),
    paidSeats: integer('paid_seats'),
    billingState: text('billing_state'),
    computedAt: ts('computed_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.agencyId, t.day] })],
);

/** Phase 8a: append-only audit of platform tool calls (UPDATE/DELETE revoked from app_service). */
export const platformAuditLog = pgTable(
  'platform_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    tool: text('tool').notNull(),
    inputHash: text('input_hash').notNull(),
    outcome: text('outcome').notNull(),
    durationMs: integer('duration_ms').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('platform_audit_log_created_idx').on(t.createdAt)],
);

export type PlatformAdminRow = typeof platformAdmin.$inferSelect;
export type AgencyDailyStatRow = typeof agencyDailyStat.$inferSelect;
