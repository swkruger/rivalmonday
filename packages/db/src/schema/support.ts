import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { agency } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Phase 8b: read-only platform support sessions. Service role only (forced RLS, no policy, nothing for app_user).
 * `platform_user_id` FK to auth."user" is added by the custom migration (same as platform_admin).
 */
export const supportSession = pgTable(
  'support_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    platformUserId: text('platform_user_id').notNull(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    startedAt: ts('started_at').notNull().defaultNow(),
    expiresAt: ts('expires_at').notNull(),
    endedAt: ts('ended_at'),
    endReason: text('end_reason').$type<'exit' | 'expired' | 'replaced' | 'revoked'>(),
  },
  (t) => [
    uniqueIndex('support_session_open_uq').on(t.platformUserId).where(sql`${t.endedAt} IS NULL`),
    index('support_session_agency_idx').on(t.agencyId, sql`${t.startedAt} DESC`),
    check('support_session_reason_check', sql`char_length(reason) BETWEEN 5 AND 300`),
    check('support_session_end_reason_check', sql`end_reason IN ('exit','expired','replaced','revoked')`),
  ],
);

export type SupportSessionRow = typeof supportSession.$inferSelect;
