import type { ToolChannel } from '@cs/core';
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** No FK since 7a2: audit rows outlive an agency purge. */
    agencyId: uuid('agency_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role').notNull(),
    tool: text('tool').notNull(),
    inputHash: text('input_hash').notNull(),
    outcome: text('outcome').notNull(),
    rowCount: integer('row_count'),
    durationMs: integer('duration_ms').notNull(),
    /** Phase 6a: which surface made the call. */
    channel: text('channel').$type<ToolChannel>().notNull().default('web'),
    /** Phase 6a: api_token.id or oauth_grant_binding.id for mcp calls. */
    tokenId: uuid('token_id'),
    /** Phase 8b: support_session.id when a platform operator made the call (no FK; audit survives). */
    supportSessionId: uuid('support_session_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_log_agency_created_idx').on(t.agencyId, t.createdAt),
    index('audit_log_token_created_idx').on(t.tokenId, t.createdAt).where(sql`token_id IS NOT NULL`),
    check('audit_log_channel_check', sql`channel IN ('web', 'mcp', 'ask')`),
  ],
);

export const llmCall = pgTable(
  'llm_call',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** No FKs since 7a2: spend rows outlive an agency/client purge. */
    agencyId: uuid('agency_id'),
    clientId: uuid('client_id'),
    task: text('task').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    costUsd: numeric('cost_usd', { precision: 14, scale: 6, mode: 'number' }),
    latencyMs: integer('latency_ms').notNull(),
    ok: boolean('ok').notNull(),
    verticalId: text('vertical_id'),
    /** 7b1: the competitor a (split) call was attributed to; no FK. */
    competitorId: uuid('competitor_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('llm_call_agency_created_idx').on(t.agencyId, t.createdAt),
    index('llm_call_created_idx').on(t.createdAt),
    index('llm_call_competitor_created_idx').on(t.competitorId, t.createdAt).where(sql`competitor_id IS NOT NULL`),
    index('llm_call_vertical_created_idx').on(t.verticalId, t.createdAt).where(sql`vertical_id IS NOT NULL`),
  ],
);

export const vendorCall = pgTable(
  'vendor_call',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** No FKs since 7a2: spend rows outlive an agency/client purge. */
    agencyId: uuid('agency_id'),
    clientId: uuid('client_id'),
    vendor: text('vendor').notNull(),
    operation: text('operation').notNull(),
    units: integer('units').notNull(),
    costUsd: numeric('cost_usd', { precision: 14, scale: 6, mode: 'number' }),
    latencyMs: integer('latency_ms').notNull(),
    ok: boolean('ok').notNull(),
    /** 7b1: the competitor a (split) call was attributed to; no FK. */
    competitorId: uuid('competitor_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('vendor_call_agency_created_idx').on(t.agencyId, t.createdAt),
    index('vendor_call_competitor_created_idx').on(t.competitorId, t.createdAt).where(sql`competitor_id IS NOT NULL`),
  ],
);
