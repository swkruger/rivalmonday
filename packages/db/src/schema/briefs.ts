import { sql } from 'drizzle-orm';
import { check, date, doublePrecision, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { move } from './engine';
import { agency, client, competitor } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });
const tenant = () => ({
  agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
  clientId: uuid('client_id').notNull(),
});
const clientFk = (t: { clientId: any; agencyId: any }) =>
  foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade');

export type BriefStatus = 'generating' | 'failed' | 'ready' | 'approved' | 'sent';
export type BriefKind = 'standard' | 'quiet';
export type Level = 'L' | 'M' | 'H';
export type RecommendationStatus = 'todo' | 'in_progress' | 'done' | 'dismissed';
export type RecommendationSource = 'brief' | 'move' | 'ask';
export type FeedbackKind = 'edit' | 'drop' | 'reorder' | 'rating' | 'status';

/** One business in a brief's trend snapshot (spec §9.1.5). Computed from stored data, never model-written. */
export interface TrendBusiness {
  competitorId: string;
  name: string;
  self: boolean;
  reviews: number;
  avgRating: number | null;
  prevAvgRating: number | null;
  /** Ads active now; null for the client's own business (we do not collect its ads). */
  activeAds: number | null;
}

export interface TrendSnapshot {
  windowDays: number;
  /** Scored events (any route) for this client in the brief period. */
  events: number;
  businesses: TrendBusiness[];
}

export interface BriefDropStats {
  items: number;
  sentences: number;
}

/** A weekly brief for one client (spec §9.1). Tenant-private; written by the service role only. */
export const brief = pgTable(
  'brief',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenant(),
    /** Local Monday the brief is delivered on (YYYY-MM-DD). */
    deliveryDate: date('delivery_date', { mode: 'string' }).notNull(),
    periodStart: ts('period_start').notNull(),
    periodEnd: ts('period_end').notNull(),
    kind: text('kind').notNull().default('standard'),
    status: text('status').notNull(),
    summary: text('summary').notNull().default(''),
    trend: jsonb('trend').$type<TrendSnapshot | null>(),
    dropped: jsonb('dropped').$type<BriefDropStats>().notNull().default(sql`'{"items":0,"sentences":0}'::jsonb`),
    attempts: integer('attempts').notNull().default(1),
    error: text('error'),
    generatedAt: ts('generated_at'),
    approvedAt: ts('approved_at'),
    approvedBy: text('approved_by'),
    sentAt: ts('sent_at'),
    pdfKey: text('pdf_key'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('brief_client_delivery_unique').on(t.clientId, t.deliveryDate),
    index('brief_agency_status_idx').on(t.agencyId, t.status),
    clientFk(t),
    check('brief_status_check', sql`status IN ('generating', 'failed', 'ready', 'approved', 'sent')`),
    check('brief_kind_check', sql`kind IN ('standard', 'quiet')`),
  ],
);

/** One verified item of a brief. `status = 'dropped'` is an AM drop (the verifier's drops are never stored). */
export const briefItem = pgTable(
  'brief_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    briefId: uuid('brief_id').notNull().references(() => brief.id, { onDelete: 'cascade' }),
    ...tenant(),
    ord: integer('ord').notNull(),
    competitorId: uuid('competitor_id').notNull().references(() => competitor.id, { onDelete: 'cascade' }),
    headline: text('headline').notNull(),
    whatChanged: text('what_changed').notNull(),
    whyItMatters: text('why_it_matters').notNull(),
    recommendedAction: text('recommended_action').notNull(),
    confidence: doublePrecision('confidence').notNull(),
    effort: text('effort').notNull(),
    impact: text('impact').notNull(),
    eventIds: jsonb('event_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    moveId: uuid('move_id').references(() => move.id, { onDelete: 'set null' }),
    evidenceIds: jsonb('evidence_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Agency-only (spec §8.5): read paths strip it for client roles. */
    upsellTag: text('upsell_tag'),
    playbookId: text('playbook_id'),
    status: text('status').notNull().default('active'),
    editedBy: text('edited_by'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('brief_item_brief_idx').on(t.briefId, t.ord),
    clientFk(t),
    check('brief_item_status_check', sql`status IN ('active', 'dropped')`),
    check('brief_item_effort_check', sql`effort IN ('L', 'M', 'H')`),
    check('brief_item_impact_check', sql`impact IN ('L', 'M', 'H')`),
  ],
);

/** A tracked next step (spec §8.5). Status changes are mirrored as feedback rows. */
export const recommendation = pgTable(
  'recommendation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenant(),
    title: text('title').notNull(),
    rationale: text('rationale').notNull(),
    evidenceIds: jsonb('evidence_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    eventIds: jsonb('event_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    moveId: uuid('move_id').references(() => move.id, { onDelete: 'set null' }),
    briefItemId: uuid('brief_item_id').references(() => briefItem.id, { onDelete: 'set null' }),
    playbookId: text('playbook_id'),
    effort: text('effort').notNull(),
    impact: text('impact').notNull(),
    owner: text('owner').notNull(),
    status: text('status').notNull().default('todo'),
    dismissReason: text('dismiss_reason'),
    dueAt: ts('due_at'),
    source: text('source').notNull(),
    upsellTag: text('upsell_tag'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('recommendation_client_status_idx').on(t.clientId, t.status),
    uniqueIndex('recommendation_brief_item_unique').on(t.briefItemId).where(sql`brief_item_id IS NOT NULL`),
    uniqueIndex('recommendation_move_unique').on(t.moveId).where(sql`source = 'move' AND move_id IS NOT NULL`),
    clientFk(t),
    check('recommendation_status_check', sql`status IN ('todo', 'in_progress', 'done', 'dismissed')`),
    check('recommendation_effort_check', sql`effort IN ('L', 'M', 'H')`),
    check('recommendation_impact_check', sql`impact IN ('L', 'M', 'H')`),
    check('recommendation_owner_check', sql`owner IN ('client', 'agency')`),
    check('recommendation_source_check', sql`source IN ('brief', 'move', 'ask')`),
  ],
);

/** Agency edits of a vertical pack playbook (spec §8.5 "agency-editable"). */
export const playbookOverride = pgTable(
  'playbook_override',
  {
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    verticalId: text('vertical_id').notNull(),
    playbookId: text('playbook_id').notNull(),
    title: text('title'),
    template: text('template'),
    disabledBy: text('disabled_by'),
    updatedBy: text('updated_by').notNull(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.agencyId, t.verticalId, t.playbookId] })],
);

/** Every AM/client action on briefs and recommendations (spec §9.1.6 "edits stored as feedback", §8.5). */
export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ...tenant(),
    subjectType: text('subject_type').notNull(), // 'brief' | 'brief_item' | 'recommendation'
    subjectId: uuid('subject_id').notNull(),
    kind: text('kind').notNull(),
    before: jsonb('before').$type<Record<string, unknown> | null>(),
    after: jsonb('after').$type<Record<string, unknown> | null>(),
    reason: text('reason'),
    actor: text('actor').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('feedback_subject_idx').on(t.subjectType, t.subjectId),
    clientFk(t),
    check('feedback_kind_check', sql`kind IN ('edit', 'drop', 'reorder', 'rating', 'status')`),
  ],
);
