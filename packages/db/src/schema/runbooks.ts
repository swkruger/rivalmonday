import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { agency, client } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Phase 14b: runbooks (plays, self-rules, knobs) copied platform -> agency -> client. One row per owner. Both tables are
 * service role only (forced RLS, no policy, nothing for app_user). `client_id` is null for platform/agency rows, so the
 * MATCH SIMPLE composite FK to client(id, agency_id) only bites on client rows.
 */
export const runbook = pgTable(
  'runbook',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    level: text('level').$type<'platform' | 'agency' | 'client'>().notNull(),
    agencyId: uuid('agency_id').references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id'),
    createdAt: ts('created_at').notNull().defaultNow(),
    tailoredAt: ts('tailored_at'),
    tailorStatus: text('tailor_status').$type<'pending' | 'done' | 'failed' | 'skipped'>(),
  },
  (t) => [
    check('runbook_level_check', sql`${t.level} IN ('platform','agency','client')`),
    check('runbook_tailor_status_check', sql`${t.tailorStatus} IN ('pending','done','failed','skipped')`),
    check(
      'runbook_owner_check',
      sql`(${t.level} = 'platform' AND ${t.agencyId} IS NULL AND ${t.clientId} IS NULL)
      OR (${t.level} = 'agency' AND ${t.agencyId} IS NOT NULL AND ${t.clientId} IS NULL)
      OR (${t.level} = 'client' AND ${t.agencyId} IS NOT NULL AND ${t.clientId} IS NOT NULL)`,
    ),
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    uniqueIndex('runbook_platform_uq').on(t.level).where(sql`level = 'platform'`),
    uniqueIndex('runbook_agency_uq').on(t.agencyId).where(sql`level = 'agency'`),
    uniqueIndex('runbook_client_uq').on(t.clientId).where(sql`level = 'client'`),
  ],
);

export const runbookItem = pgTable(
  'runbook_item',
  {
    runbookId: uuid('runbook_id').notNull().references(() => runbook.id, { onDelete: 'cascade' }),
    itemKey: text('item_key').notNull(),
    kind: text('kind').$type<'play' | 'self_rule' | 'knob'>().notNull(),
    content: jsonb('content').$type<unknown>().notNull(),
    enabled: boolean('enabled').notNull().default(true),
    businessAreaIds: text('business_area_ids').array(),
    version: integer('version').notNull().default(1),
    upstreamVersion: integer('upstream_version'),
    upstreamSnapshot: jsonb('upstream_snapshot').$type<unknown>(),
    dismissedUpstreamVersion: integer('dismissed_upstream_version'),
    customised: boolean('customised').notNull().default(false),
    removedUpstream: boolean('removed_upstream').notNull().default(false),
    updatedBy: text('updated_by').notNull(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.runbookId, t.itemKey] }),
    check('runbook_item_key_check', sql`${t.itemKey} ~ '^(play|self_rule|knob):[a-z][a-z0-9_]{0,79}$'`),
    check('runbook_item_kind_check', sql`${t.kind} IN ('play','self_rule','knob')`),
    check('runbook_item_version_check', sql`${t.version} > 0`),
    check('runbook_item_key_kind_check', sql`split_part(${t.itemKey}, ':', 1) = ${t.kind}`),
  ],
);
