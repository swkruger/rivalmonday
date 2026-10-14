import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export const PLATFORM_COST_SERVICES = ['openrouter', 'dataforseo', 'scrapecreators', 'apify', 'anthropic', 'neon'] as const;
export type PlatformCostServiceName = (typeof PLATFORM_COST_SERVICES)[number];

/**
 * Phase 8c: platform hosting costs. All three tables are service role only (forced RLS, no policy, nothing for
 * app_user). `numeric` columns come back as strings (drizzle default, like llm_call.spend_usd) - convert at the read boundary.
 */
export const platformCostService = pgTable(
  'platform_cost_service',
  {
    service: text('service').primaryKey().$type<PlatformCostServiceName>(),
    enabled: boolean('enabled').notNull().default(true),
    billingUrl: text('billing_url'),
    lowThresholdUsd: numeric('low_threshold_usd', { precision: 12, scale: 2 }),
    warnDays: integer('warn_days').notNull().default(7),
    unitRateUsd: numeric('unit_rate_usd', { precision: 14, scale: 8 }),
    alertedAt: ts('alerted_at'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    updatedBy: text('updated_by'),
  },
  (t) => [
    check('platform_cost_service_service_check', sql`${t.service} in ('openrouter','dataforseo','scrapecreators','apify','anthropic','neon')`),
    check('platform_cost_service_warn_days_check', sql`${t.warnDays} between 0 and 90`),
  ],
);

export const platformCostSnapshot = pgTable(
  'platform_cost_snapshot',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    service: text('service').notNull().references(() => platformCostService.service),
    takenAt: ts('taken_at').notNull().defaultNow(),
    status: text('status').notNull().$type<'ok' | 'error' | 'unavailable'>(),
    kind: text('kind').notNull().$type<'balance' | 'usage'>(),
    amountUsd: numeric('amount_usd', { precision: 14, scale: 4 }),
    units: numeric('units', { precision: 20, scale: 4 }),
    capUsd: numeric('cap_usd', { precision: 14, scale: 4 }),
    error: text('error'),
  },
  (t) => [
    index('platform_cost_snapshot_service_taken_idx').on(t.service, sql`${t.takenAt} DESC`),
    check('platform_cost_snapshot_status_check', sql`${t.status} in ('ok','error','unavailable')`),
    check('platform_cost_snapshot_kind_check', sql`${t.kind} in ('balance','usage')`),
    check('platform_cost_snapshot_error_check', sql`length(${t.error}) <= 120`),
  ],
);

export const platformCostItem = pgTable(
  'platform_cost_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    kind: text('kind').notNull().$type<'recurring' | 'one_off'>(),
    amountUsd: numeric('amount_usd', { precision: 12, scale: 2 }).notNull(),
    period: text('period').$type<'monthly' | 'yearly'>(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on'),
    billingUrl: text('billing_url'),
    notes: text('notes'),
    archivedAt: ts('archived_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
    createdBy: text('created_by').notNull(),
  },
  (t) => [
    check('platform_cost_item_name_check', sql`length(${t.name}) between 1 and 80`),
    check('platform_cost_item_kind_check', sql`${t.kind} in ('recurring','one_off')`),
    check('platform_cost_item_amount_check', sql`${t.amountUsd} >= 0`),
    check('platform_cost_item_period_check', sql`${t.period} in ('monthly','yearly')`),
    check('platform_cost_item_billing_url_check', sql`length(${t.billingUrl}) <= 500`),
    check('platform_cost_item_notes_check', sql`length(${t.notes}) <= 500`),
    check('platform_cost_item_period_ck', sql`(${t.kind} = 'recurring') = (${t.period} is not null)`),
    check('platform_cost_item_oneoff_ck', sql`${t.kind} = 'recurring' or ${t.endsOn} is null`),
    check('platform_cost_item_dates_ck', sql`${t.endsOn} is null or ${t.endsOn} >= ${t.startsOn}`),
  ],
);

export type PlatformCostServiceRow = typeof platformCostService.$inferSelect;
export type PlatformCostSnapshotRow = typeof platformCostSnapshot.$inferSelect;
export type PlatformCostItemRow = typeof platformCostItem.$inferSelect;
