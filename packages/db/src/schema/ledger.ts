import type { ToolChannel } from '@cs/core';
import { sql } from 'drizzle-orm';
import { boolean, check, doublePrecision, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { agency, client } from './tenancy';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
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
    agencyId: uuid('agency_id').references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').references(() => client.id, { onDelete: 'cascade' }),
    task: text('task').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    costUsd: doublePrecision('cost_usd'),
    latencyMs: integer('latency_ms').notNull(),
    ok: boolean('ok').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('llm_call_agency_created_idx').on(t.agencyId, t.createdAt)],
);

export const vendorCall = pgTable(
  'vendor_call',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').references(() => client.id, { onDelete: 'cascade' }),
    vendor: text('vendor').notNull(),
    operation: text('operation').notNull(),
    units: integer('units').notNull(),
    costUsd: doublePrecision('cost_usd'),
    latencyMs: integer('latency_ms').notNull(),
    ok: boolean('ok').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('vendor_call_agency_created_idx').on(t.agencyId, t.createdAt)],
);
