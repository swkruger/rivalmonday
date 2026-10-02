import { sql } from 'drizzle-orm';
import { foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { changeEvent } from './engine';
import { agency, client } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export type DecisionSampleReason = 'shadow' | 'review';
export type LabelSource = 'human' | 'review';
export type ModelBatchStatus = 'submitted' | 'ended' | 'failed';

/** One provider's answers inside a sample (answers keyed by question key, as returned by @cs/ai). */
export interface SampleAnswers {
  provider: string;
  answers: Record<string, unknown>;
}

/**
 * A decision kept for evaluation (spec §7.3 shadow evaluation): a sampled call answered by both providers,
 * or a call still below threshold after the cascade. The state was redacted at the call site. Service role only.
 */
export const decisionSample = pgTable(
  'decision_sample',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    task: text('task').notNull(),
    reason: text('reason').$type<DecisionSampleReason>().notNull(),
    agencyId: uuid('agency_id').references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').references(() => client.id, { onDelete: 'cascade' }),
    state: jsonb('state').$type<unknown>().notNull(),
    questions: jsonb('questions').$type<Record<string, unknown>>().notNull(),
    primary: jsonb('primary_answers').$type<SampleAnswers | null>(),
    fallback: jsonb('fallback_answers').$type<SampleAnswers | null>(),
    final: jsonb('final_answers').$type<Record<string, unknown>>().notNull(),
    needsReview: jsonb('needs_review').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('decision_sample_task_idx').on(t.task, t.createdAt)],
);

/** A human gold label for one question of a sample (CSV import or a resolved decision_review). Service role only. */
export const decisionLabel = pgTable(
  'decision_label',
  {
    sampleId: uuid('sample_id').notNull().references(() => decisionSample.id, { onDelete: 'cascade' }),
    questionKey: text('question_key').notNull(),
    /** 'true'/'false' for a Noul, the option id for a Choice, the level index for a Score. */
    value: text('value').notNull(),
    source: text('source').$type<LabelSource>().notNull(),
    labeledBy: text('labeled_by').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sampleId, t.questionKey] })],
);

/** An asynchronous provider batch (Anthropic Message Batches) and what each custom_id stands for. Service role only. */
export const modelBatch = pgTable(
  'model_batch',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    task: text('task').notNull(),
    provider: text('provider').notNull(),
    providerBatchId: text('provider_batch_id').notNull().unique(),
    purpose: text('purpose').notNull(), // 'theme_discovery'
    status: text('status').$type<ModelBatchStatus>().notNull().default('submitted'),
    /** custom_id → the context needed to apply that request's result. */
    items: jsonb('items').$type<Record<string, unknown>>().notNull(),
    requestCount: integer('request_count').notNull(),
    error: text('error'),
    createdAt: ts('created_at').notNull().defaultNow(),
    endedAt: ts('ended_at'),
  },
  (t) => [index('model_batch_status_idx').on(t.status, t.createdAt)],
);

/** Backoff state of a failing (event, client) score (Phase 3d decision 11). Deleted on success. Service role only. */
export const scoreFailure = pgTable(
  'score_failure',
  {
    eventId: uuid('event_id').notNull().references(() => changeEvent.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    attempts: integer('attempts').notNull().default(1),
    error: text('error'),
    failedAt: ts('failed_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.clientId] }),
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
  ],
);
