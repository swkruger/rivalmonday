import { sql } from 'drizzle-orm';
import { type AnyPgColumn, boolean, check, date, doublePrecision, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { TrendBusiness } from './briefs';
import { changeEvent } from './engine';
import { agency, client, competitor } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });
const clientFk = (t: { clientId: AnyPgColumn; agencyId: AnyPgColumn }) =>
  foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade');

/** Delivery channels. 'sms' is reserved (Twilio, after Phase 4b): the CHECKs allow it, nothing creates or sends one yet. */
export type Channel = 'in_app' | 'email' | 'slack' | 'teams';
export type ContactRole = 'agency_admin' | 'account_manager' | 'client_owner' | 'client_viewer';
export const CLIENT_KINDS = ['alert', 'alert_digest', 'brief', 'trend_report'] as const;
export const AGENCY_KINDS = ['am_alert', 'brief_ready', 'brief_failed', 'brief_overdue', 'trend_report'] as const;
export type NotificationKind = (typeof CLIENT_KINDS)[number] | (typeof AGENCY_KINDS)[number];
export type NotificationStatus = 'pending' | 'sending' | 'sent' | 'failed';
export type AlertMode = 'direct' | 'after_am_check' | 'digest_only';
export type AlertStatus = 'drafting' | 'pending_review' | 'approved' | 'delivered' | 'dismissed' | 'withdrawn' | 'expired';
export type AlertDelivery = 'immediate' | 'digest';

/** Local quiet window, 'HH:MM' 24-hour; may wrap midnight (21:00 → 07:00). */
export interface QuietHours {
  start: string;
  end: string;
}

/** Per-agency white-label settings (spec §5.1), edited by Phase 5. Every field optional; defaults are the Rival Monday tokens. */
export interface AgencyBranding {
  displayName?: string;
  logoUrl?: string;
  primary?: string;
  secondary?: string;
  accent?: string;
  fromName?: string;
  /** Phase 2 per-agency sending domains; MVP sends from EMAIL_FROM. */
  fromEmail?: string;
  signOff?: string;
}

/** Spec §9.2 quarterly trend report: deterministic numbers only, never model-written. */
export interface TrendReportData {
  quarter: string;
  windowDays: number;
  businesses: TrendBusiness[];
  eventsByType: Record<string, number>;
  moves: { moveType: string; competitorName: string; status: string; firstDetectedAt: string }[];
  briefsSent: number;
  alertsDelivered: number;
  recommendations: { created: number; done: number; inProgress: number; dismissed: number };
}

/** A person who receives notifications. Phase 5 links it to a user. Service role only (forced RLS, no policy). */
export const contact = pgTable(
  'contact',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    /** Set for client roles; NULL for agency staff. */
    clientId: uuid('client_id'),
    role: text('role').notNull(),
    name: text('name'),
    email: text('email').notNull(),
    /** IANA zone; NULL = the client's zone (agency staff: America/Chicago). */
    timezone: text('timezone'),
    quietHours: jsonb('quiet_hours').$type<QuietHours | null>(),
    /** Agency staff only: the clients they cover; NULL = every client of the agency. */
    clientScope: jsonb('client_scope').$type<string[] | null>(),
    /** Phase 5: the user this contact belongs to. */
    userId: text('user_id'),
    active: boolean('active').notNull().default(true),
    /** Deep-link tokens issued before this moment are refused (Phase 5 route). */
    linksRevokedBefore: ts('links_revoked_before'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('contact_email_unique').on(t.agencyId, sql`coalesce(${t.clientId}, '00000000-0000-0000-0000-000000000000'::uuid)`, sql`lower(${t.email})`),
    index('contact_client_idx').on(t.clientId),
    clientFk(t),
    check('contact_role_check', sql`role IN ('agency_admin', 'account_manager', 'client_owner', 'client_viewer')`),
    check('contact_role_scope_check', sql`(client_id IS NULL) = (role IN ('agency_admin', 'account_manager'))`),
    check('contact_email_check', sql`email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'`),
  ],
);

/** One override of the default (every kind on in_app + email). Service role only. */
export const notificationPref = pgTable(
  'notification_pref',
  {
    contactId: uuid('contact_id').notNull().references(() => contact.id, { onDelete: 'cascade' }),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    channel: text('channel').notNull(),
    enabled: boolean('enabled').notNull(),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.kind, t.channel] }), check('notification_pref_channel_check', sql`channel IN ('in_app', 'email', 'sms')`)],
);

/** An agency Slack/Teams incoming webhook (spec §9.3). The URL is a secret: service role only. */
export const agencyWebhook = pgTable(
  'agency_webhook',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    url: text('url').notNull(),
    /** Agency notification kinds to post; NULL = all of them. */
    kinds: jsonb('kinds').$type<string[] | null>(),
    active: boolean('active').notNull().default(true),
    createdBy: text('created_by').notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [index('agency_webhook_agency_idx').on(t.agencyId), check('agency_webhook_kind_check', sql`kind IN ('slack', 'teams')`)],
);

/** The outbox and the in-app inbox: one row per recipient × channel × message. Service role only. */
export const notification = pgTable(
  'notification',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    contactId: uuid('contact_id').references(() => contact.id, { onDelete: 'cascade' }),
    webhookId: uuid('webhook_id').references(() => agencyWebhook.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    kind: text('kind').notNull(),
    subjectType: text('subject_type').notNull(), // 'alert' | 'brief' | 'digest' | 'trend_report'
    subjectId: uuid('subject_id').notNull(),
    /** Idempotency: the same message to the same recipient on the same channel is inserted once. */
    dedupeKey: text('dedupe_key').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    link: text('link'),
    /** Email: the address; webhooks: NULL (the URL is read from agency_webhook at send time). */
    address: text('address'),
    /** Email template input ({ template, props, replyTo }); rendered at send time. */
    payload: jsonb('payload').$type<Record<string, unknown> | null>(),
    status: text('status').notNull(),
    notBefore: ts('not_before').notNull().defaultNow(),
    attempts: integer('attempts').notNull().default(0),
    claimedAt: ts('claimed_at'),
    providerId: text('provider_id'),
    error: text('error'),
    sentAt: ts('sent_at'),
    readAt: ts('read_at'),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [
    unique('notification_dedupe_key_unique').on(t.dedupeKey),
    index('notification_due_idx').on(t.status, t.notBefore),
    index('notification_contact_idx').on(t.contactId, t.createdAt),
    clientFk(t),
    check('notification_channel_check', sql`channel IN ('in_app', 'email', 'slack', 'teams', 'sms')`),
    check('notification_status_check', sql`status IN ('pending', 'sending', 'sent', 'failed')`),
    check('notification_recipient_check', sql`(contact_id IS NULL) <> (webhook_id IS NULL)`),
  ],
);

/** An instant alert (spec §9.3): one or more near-duplicate events for one client. Tenant table, service-role writes. */
export const alert = pgTable(
  'alert',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    competitorId: uuid('competitor_id').notNull().references(() => competitor.id, { onDelete: 'cascade' }),
    /** The event the text was written from; merged near-duplicates are in alert_event only. */
    eventId: uuid('event_id').notNull().references(() => changeEvent.id, { onDelete: 'cascade' }),
    score: doublePrecision('score').notNull(),
    headline: text('headline').notNull().default(''),
    body: text('body').notNull().default(''),
    /** 'model' (verified alert_writer text) or 'template' (evidence-derived fallback). */
    written: text('written'),
    evidenceIds: jsonb('evidence_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    status: text('status').notNull(),
    /** The client's alert mode when the alert was created. */
    mode: text('mode').notNull(),
    delivery: text('delivery'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: ts('reviewed_at'),
    dismissReason: text('dismiss_reason'),
    deliveredAt: ts('delivered_at'),
    /** Client-local date of delivery: the throttle counts immediate deliveries per local day. */
    deliveredLocalDate: date('delivered_local_date', { mode: 'string' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('alert_client_status_idx').on(t.clientId, t.status),
    index('alert_client_competitor_idx').on(t.clientId, t.competitorId, t.createdAt),
    clientFk(t),
    check('alert_status_check', sql`status IN ('drafting', 'pending_review', 'approved', 'delivered', 'dismissed', 'withdrawn', 'expired')`),
    check('alert_mode_check', sql`mode IN ('direct', 'after_am_check', 'digest_only')`),
    check('alert_delivery_check', sql`delivery IS NULL OR delivery IN ('immediate', 'digest')`),
    check('alert_written_check', sql`written IS NULL OR written IN ('model', 'template')`),
  ],
);

/** Every event an alert stands for (the primary one included). An event is in at most one alert per client. */
export const alertEvent = pgTable(
  'alert_event',
  {
    alertId: uuid('alert_id').notNull().references(() => alert.id, { onDelete: 'cascade' }),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    eventId: uuid('event_id').notNull().references(() => changeEvent.id, { onDelete: 'cascade' }),
    createdAt: ts('created_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.alertId, t.eventId] }), unique('alert_event_client_event_unique').on(t.clientId, t.eventId), clientFk(t)],
);

/** Spec §9.2 quarterly trend report, one per client and calendar quarter. Tenant table, service-role writes. */
export const trendReport = pgTable(
  'trend_report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    quarter: text('quarter').notNull(), // '2026-Q3'
    periodStart: ts('period_start').notNull(),
    periodEnd: ts('period_end').notNull(),
    data: jsonb('data').$type<TrendReportData | null>(),
    status: text('status').notNull(),
    pdfKey: text('pdf_key'),
    createdAt: ts('created_at').notNull().defaultNow(),
    sentAt: ts('sent_at'),
  },
  (t) => [
    unique('trend_report_client_quarter_unique').on(t.clientId, t.quarter),
    clientFk(t),
    check('trend_report_status_check', sql`status IN ('ready', 'sent')`),
    check('trend_report_quarter_check', sql`quarter ~ '^[0-9]{4}-Q[1-4]$'`),
  ],
);
