import { sql } from 'drizzle-orm';
import { check, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true });

/**
 * 7c2: platform-level operational alerts (e.g. brief readiness). Service role only (forced RLS, no policy,
 * every privilege revoked from app_user). One open row per `dedupe_key`; the job refreshes `last_seen_at`
 * and sets `resolved_at` when the condition clears.
 */
export const opsAlert = pgTable(
  'ops_alert',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    dedupeKey: text('dedupe_key').notNull().unique(),
    severity: text('severity').notNull(),
    summary: jsonb('summary').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    emailedAt: ts('emailed_at'),
    resolvedAt: ts('resolved_at'),
  },
  () => [
    check('ops_alert_kind_check', sql`kind IN ('brief_readiness')`),
    check('ops_alert_severity_check', sql`severity IN ('warning','critical')`),
  ],
);

export type OpsAlert = typeof opsAlert.$inferSelect;
export type OpsAlertSeverity = 'warning' | 'critical';
