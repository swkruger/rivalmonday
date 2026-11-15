import { sql } from 'drizzle-orm';
import { bigint, boolean, check, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { agency } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

export type AgencyDomainStatus = 'pending' | 'verifying' | 'live' | 'failed' | 'removed';
export type SendingDomainStatus = 'pending' | 'verified' | 'failed' | 'removed';
/** One DNS record the agency must create, as the vendor reports it. */
export type DnsRecord = { type: string; name: string; value: string };

/**
 * Phase 13a: the agency's custom web subdomain (spec 13a § Data model). At most one non-removed row per agency and per
 * hostname. RLS (0112): agency admins/account managers read their own rows; every write is service-role (tools).
 */
export const agencyDomain = pgTable(
  'agency_domain',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    /** Lower-case, no trailing dot. */
    hostname: text('hostname').notNull(),
    status: text('status').$type<AgencyDomainStatus>().notNull().default('pending'),
    dnsRecords: jsonb('dns_records').$type<DnsRecord[]>().notNull().default(sql`'[]'::jsonb`),
    error: text('error'),
    createdAt: ts('created_at').notNull().defaultNow(),
    lastCheckedAt: ts('last_checked_at'),
    liveAt: ts('live_at'),
    removedAt: ts('removed_at'),
  },
  (t) => [
    check('agency_domain_status_check', sql`${t.status} IN ('pending','verifying','live','failed','removed')`),
    uniqueIndex('agency_domain_hostname_active').on(t.hostname).where(sql`${t.status} <> 'removed'`),
    uniqueIndex('agency_domain_one_per_agency').on(t.agencyId).where(sql`${t.status} <> 'removed'`),
  ],
);

/**
 * Phase 13a: the agency's own email sending domain (Postmark). At most one non-removed row per agency and per domain. RLS (0112) as
 * `agency_domain`.
 */
export const agencySendingDomain = pgTable(
  'agency_sending_domain',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    localPart: text('local_part').notNull().default('briefs'),
    postmarkDomainId: bigint('postmark_domain_id', { mode: 'number' }),
    dkimHost: text('dkim_host'),
    dkimValue: text('dkim_value'),
    returnPathHost: text('return_path_host'),
    returnPathValue: text('return_path_value'),
    status: text('status').$type<SendingDomainStatus>().notNull().default('pending'),
    dmarcOk: boolean('dmarc_ok'),
    error: text('error'),
    createdAt: ts('created_at').notNull().defaultNow(),
    lastCheckedAt: ts('last_checked_at'),
    verifiedAt: ts('verified_at'),
  },
  (t) => [
    check('agency_sending_domain_status_check', sql`${t.status} IN ('pending','verified','failed','removed')`),
    check('agency_sending_domain_local_part_check', sql`${t.localPart} ~ '^[a-z0-9][a-z0-9._-]{0,39}$'`),
    uniqueIndex('agency_sending_domain_one_per_agency').on(t.agencyId).where(sql`${t.status} <> 'removed'`),
    // 0113 (Task 10 review): a domain is held by one agency at a time (shared Postmark account).
    uniqueIndex('agency_sending_domain_domain_active').on(t.domain).where(sql`${t.status} <> 'removed'`),
  ],
);

export type AgencyDomainRow = typeof agencyDomain.$inferSelect;
export type NewAgencyDomainRow = typeof agencyDomain.$inferInsert;
export type AgencySendingDomainRow = typeof agencySendingDomain.$inferSelect;
export type NewAgencySendingDomainRow = typeof agencySendingDomain.$inferInsert;
