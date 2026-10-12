import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { agency, client } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Phase 6b: Ask conversations. Author-only RLS (migration ask_rls): not even agency admins read a user's threads
 * through app_user (platform review uses the service role). user_id FK to auth."user" is added by the custom migration.
 */
export const askThread = pgTable(
  'ask_thread',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    userId: text('user_id').notNull(),
    title: text('title').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('ask_thread_user_idx').on(t.userId, t.clientId, t.updatedAt.desc()),
    // Target of ask_message's composite FK: a message's thread must belong to the same user.
    unique('ask_thread_id_user_id_unique').on(t.id, t.userId),
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    check('ask_thread_title_check', sql`length(title) BETWEEN 1 AND 80`),
  ],
);

export const askMessage = pgTable(
  'ask_message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id').notNull(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role').$type<'user' | 'assistant' | 'action'>().notNull(),
    content: text('content').notNull(),
    /** Prefixed refs, e.g. 'ev:<uuid>' (6c adds 'kb:'). */
    citations: text('citations').array().notNull().default(sql`'{}'::text[]`),
    status: text('status').$type<'ok' | 'quota' | 'refused' | 'error' | 'cancelled'>().notNull().default('ok'),
    /** True on user messages from client roles. */
    countsTowardQuota: boolean('counts_toward_quota').notNull().default(false),
    /** AskAction (defined in @cs/ask). */
    action: jsonb('action').$type<unknown>(),
    /** AskTrace (defined in @cs/ask); never raw scraped text. */
    trace: jsonb('trace').$type<unknown>(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('ask_message_thread_idx').on(t.threadId, t.createdAt),
    index('ask_message_quota_idx').on(t.clientId, t.createdAt).where(sql`counts_toward_quota`),
    foreignKey({ columns: [t.threadId, t.userId], foreignColumns: [askThread.id, askThread.userId] }).onDelete('cascade'),
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    check('ask_message_role_check', sql`role IN ('user', 'assistant', 'action')`),
    check('ask_message_status_check', sql`status IN ('ok', 'quota', 'refused', 'error', 'cancelled')`),
  ],
);

/** Weekly starter questions per client; written by the worker (service role), read by the UI. */
export const askStarter = pgTable(
  'ask_starter',
  {
    clientId: uuid('client_id').primaryKey(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    questions: text('questions').array().notNull(),
    generatedAt: ts('generated_at').notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    check('ask_starter_questions_check', sql`cardinality(questions) BETWEEN 1 AND 4`),
  ],
);
