import type { TokenScope } from '@cs/core';
import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { agency, client } from './tenancy';

const ts = (name: string) => timestamp(name, { withTimezone: true });

/**
 * Phase 6a: personal access tokens for the remote MCP server. Only sha256(token) is stored. app_user may read every
 * column except token_hash and update only revoked_at (migration mcp_rls); inserts are service-role after TS checks.
 * user_id FK to auth."user" is added by the custom migration.
 */
export const apiToken = pgTable(
  'api_token',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    /** NULL = agency-wide (agency roles); set = bound to one client. */
    clientId: uuid('client_id'),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    tokenPrefix: text('token_prefix').notNull(),
    scope: text('scope').$type<TokenScope>().notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    lastUsedAt: ts('last_used_at'),
    revokedAt: ts('revoked_at'),
  },
  (t) => [
    index('api_token_user_idx').on(t.userId).where(sql`revoked_at IS NULL`),
    index('api_token_agency_idx').on(t.agencyId),
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    check('api_token_name_check', sql`length(name) BETWEEN 1 AND 80`),
    check('api_token_scope_check', sql`scope IN ('read', 'feedback', 'manage')`),
  ],
);

/** Phase 6a: what an OAuth consent granted (written by the auth flow, service role). `id` is the audit token_id. */
export const oauthGrantBinding = pgTable(
  'oauth_grant_binding',
  {
    consentId: text('consent_id').primaryKey(),
    id: uuid('id').notNull().defaultRandom().unique(),
    oauthClientId: text('oauth_client_id').notNull(),
    agencyId: uuid('agency_id').notNull().references(() => agency.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    clientId: uuid('client_id'),
    scope: text('scope').$type<TokenScope>().notNull(),
    createdAt: ts('created_at').notNull().defaultNow(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [
    index('oauth_grant_binding_user_idx').on(t.userId).where(sql`revoked_at IS NULL`),
    index('oauth_grant_binding_agency_idx').on(t.agencyId),
    foreignKey({ columns: [t.clientId, t.agencyId], foreignColumns: [client.id, client.agencyId] }).onDelete('cascade'),
    check('oauth_grant_binding_scope_check', sql`scope IN ('read', 'feedback', 'manage')`),
  ],
);

/** Phase 6a d9: fixed-window rate counters per token key (`pat:<id>` | `oauth:<consent_id>`). Service role only. */
export const mcpRateWindow = pgTable(
  'mcp_rate_window',
  {
    tokenKey: text('token_key').notNull(),
    windowKind: text('window_kind').notNull(),
    windowStart: ts('window_start').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.tokenKey, t.windowKind, t.windowStart] }),
    check('mcp_rate_window_kind_check', sql`window_kind IN ('minute', 'day')`),
  ],
);
