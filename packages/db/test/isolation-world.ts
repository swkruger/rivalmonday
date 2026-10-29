/**
 * Phase 7c1: the isolation world — one deterministic, canary-tagged fixture that the RLS sweep, the registry-wide
 * tool isolation suite and the Ask evals all seed (plan Decisions 5–6).
 *
 * Tenants: agencies `A`, `B`; clients `A1`, `A2` (agency A) and `B1` (agency B); public competitor tenants `X`
 * (tracked by A1 and B1), `Y` (A2 only) and `Z` (B1 only). Every row with a free-text column carries a
 * `CANARY-<tenant>-<n>` phrase; ids are `worldId(table, tenant, n)` (seedTenancy's `IDS` keep their values).
 *
 * Seeds through the OWNER connection (bypasses RLS) into an already-emptied database (`truncateAll` first), in FK
 * order, with no randomness. Timestamps are relative to the current UTC midnight, so "recent" windows always find the
 * rows; ids, pks and canaries never depend on the clock.
 */
import { createHash } from 'node:crypto';
import { type AccessContext, type ClientScope, FEATURES, PLAN_FEATURES, type Role, createAccessContext } from '@cs/core';
import { eq, sql } from 'drizzle-orm';
import type { Db } from '../src/client';
import { agency, client, clientCompetitor, competitor } from '../src/schema';
import { IDS, seedPlatformCostServices, seedTenancy } from './helpers';

export type TenantKey = 'A' | 'A1' | 'A2' | 'B' | 'B1' | 'X' | 'Y' | 'Z';
export type WorldUser = 'adminA' | 'adminB' | 'amA' | 'ownerA1' | 'ownerA2' | 'viewerA1' | 'operator';

export interface IsolationWorld {
  ids: typeof IDS & { competitorZ: string };
  users: Record<WorldUser, { userId: string; email: string; agencyId: string; role: Role | null; clientScope: ClientScope }>;
  /** Access context of a world user (agency/client roles; every client feature and plan feature on). */
  ctx(user: Exclude<WorldUser, 'operator'>): AccessContext;
  /** The operator's agency-A admin context (the operator also has an active `platform_admin` row, role `owner`). */
  operatorCtx(): AccessContext;
  /** table -> tenant -> primary-key objects (snake_case DB column names, values as `to_jsonb` renders them). */
  rows: Record<string, Partial<Record<TenantKey, Record<string, unknown>[]>>>;
  /** Every `CANARY-<tenant>-<n>` phrase seeded for the tenant, in seeding order. */
  canaries(tenant: TenantKey): string[];
  /** Every uuid value of a single-column primary key seeded for the tenant (composite link keys are left out). */
  idsOf(tenant: TenantKey): string[];
  /** Tenants whose data the user must never see (Decision 6, static). */
  forbidden(user: WorldUser): TenantKey[];
  /** Evidence object key -> stored text, for a memory evidence store (`fetch`, `get_evidence`). */
  evidenceText: Map<string, string>;
  /**
   * Platform-level rows (class `platform` / no tenant; not recorded in `rows`) that the operator tools' positive
   * controls act on: an agency-A-created unreviewed vertical with two areas, a pool lead, a discount code, an invite
   * link, a cost item and a topic proposal.
   */
  platformIds: {
    unreviewedVertical: string; unreviewedArea: string; unreviewedArea2: string; poolLead: string; discountCode: string; inviteLink: string; costItem: string;
    topicProposal: string;
    waitlistAgency: string; waitlistAgencySample: string; waitlistBusiness: string; waitlistUnconfirmed: string;
  };
}

const TENANTS: readonly TenantKey[] = ['A', 'A1', 'A2', 'B', 'B1', 'X', 'Y', 'Z'];

/** Deterministic uuid: sha256(`table:tenant:n`) laid out as a version-4 / variant-1 uuid. */
export function worldId(table: string, tenant: TenantKey, n: number): string {
  return hashUuid(`${table}:${tenant}:${n}`);
}

function hashUuid(seed: string): string {
  const h = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('');
  h[12] = '4';
  h[16] = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  const s = h.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

const FORBIDDEN: Record<WorldUser, TenantKey[]> = {
  adminA: ['B', 'B1', 'Z'],
  operator: ['B', 'B1', 'Z'],
  amA: ['A2', 'Y', 'B', 'B1', 'Z'],
  ownerA1: ['A2', 'Y', 'B', 'B1', 'Z'],
  viewerA1: ['A2', 'Y', 'B', 'B1', 'Z'],
  ownerA2: ['A1', 'X', 'B', 'B1', 'Z'],
  adminB: ['A', 'A1', 'A2', 'Y'],
};

type UserSpec = { userId: string; email: string; agencyId: string; role: Role; clientScope: ClientScope; clientId: string | null };
/** Lazy: `helpers.ts` re-exports this module, so `IDS` is not initialised yet while this module body runs. */
const usersSpec = (): Record<WorldUser, UserSpec> => ({
  adminA: { userId: 'world-admin-a', email: 'admin-a@world.example', agencyId: IDS.agencyA, role: 'agency_admin', clientScope: 'all', clientId: null },
  adminB: { userId: 'world-admin-b', email: 'admin-b@world.example', agencyId: IDS.agencyB, role: 'agency_admin', clientScope: 'all', clientId: null },
  amA: { userId: 'world-am-a', email: 'am-a@world.example', agencyId: IDS.agencyA, role: 'account_manager', clientScope: [IDS.clientA1], clientId: null },
  ownerA1: { userId: 'world-owner-a1', email: 'owner-a1@world.example', agencyId: IDS.agencyA, role: 'client_owner', clientScope: [IDS.clientA1], clientId: IDS.clientA1 },
  ownerA2: { userId: 'world-owner-a2', email: 'owner-a2@world.example', agencyId: IDS.agencyA, role: 'client_owner', clientScope: [IDS.clientA2], clientId: IDS.clientA2 },
  viewerA1: { userId: 'world-viewer-a1', email: 'viewer-a1@world.example', agencyId: IDS.agencyA, role: 'client_viewer', clientScope: [IDS.clientA1], clientId: IDS.clientA1 },
  operator: { userId: 'world-operator', email: 'operator@world.example', agencyId: IDS.agencyA, role: 'agency_admin', clientScope: 'all', clientId: null },
});

let usersMemo: Record<WorldUser, UserSpec> | undefined;
const worldUsers = () => (usersMemo ??= usersSpec());

const COMPETITOR_Z = worldId('competitor', 'Z', 1);
const DAY = 86_400_000;
const FACTORS = {
  typeWeight: 1, size: 0.95, serviceOverlap: 1, territoryOverlap: 1, relevance: 1, novelty: 0.9, maxSimilarity: 0.1, needsReviewCap: false,
  thresholds: { alert: 70, brief: 40 }, scoringVersion: 1,
};

type Row = Record<string, unknown>;

class WorldBuilder {
  readonly rows: IsolationWorld['rows'] = {};
  readonly canaryList = new Map<TenantKey, string[]>(TENANTS.map((t) => [t, []]));
  readonly idSet = new Map<TenantKey, Set<string>>(TENANTS.map((t) => [t, new Set()]));
  readonly evidenceText = new Map<string, string>();
  private readonly counters = new Map<string, number>();
  private pkCols = new Map<string, string[]>();
  private readonly day0 = Math.floor(Date.now() / DAY) * DAY;

  constructor(readonly db: Db) {}

  async loadPrimaryKeys(): Promise<void> {
    const r = (await this.db.execute(sql`
      SELECT c.relname AS t, array_agg(a.attname::text ORDER BY array_position(i.indkey::int2[], a.attnum)) AS cols
      FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY (i.indkey::int2[])
      WHERE i.indisprimary GROUP BY c.relname`)) as unknown as { t: string; cols: string[] }[];
    this.pkCols = new Map(r.map((x) => [x.t, x.cols]));
  }

  /** Next canary phrase of the tenant. */
  c(tenant: TenantKey): string {
    const list = this.canaryList.get(tenant)!;
    const phrase = `CANARY-${tenant}-${list.length + 1}`;
    list.push(phrase);
    return phrase;
  }

  /** Next deterministic id for (table, tenant). */
  id(table: string, tenant: TenantKey): string {
    const k = `${table}:${tenant}`;
    const n = (this.counters.get(k) ?? 0) + 1;
    this.counters.set(k, n);
    return worldId(table, tenant, n);
  }

  /** ISO timestamp `daysAgo` days (+ `hours`) before today's UTC midnight. */
  at(daysAgo: number, hours = 0): string {
    return new Date(this.day0 - daysAgo * DAY + hours * 3_600_000).toISOString();
  }

  date(daysAgo: number): string {
    return this.at(daysAgo).slice(0, 10);
  }

  /** Inserts one row (named columns only, so defaults apply to the rest) and records its pk under `tenant`. */
  async ins(table: string, tenant: TenantKey | null, values: Row): Promise<Row> {
    const cols = sql.join(Object.keys(values).map((c) => sql.identifier(c)), sql`, `);
    const r = (await this.db.execute(sql`
      INSERT INTO ${sql.identifier(table)} AS x (${cols})
      SELECT ${cols} FROM jsonb_populate_record(null::${sql.identifier(table)}, ${JSON.stringify(values)}::jsonb)
      RETURNING to_jsonb(x) AS j`)) as unknown as { j: Row }[];
    const row = r[0]!.j;
    if (tenant) this.track(table, tenant, row);
    return row;
  }

  /** Records an existing row (by its full jsonb or a superset of its pk) under `tenant`. */
  track(table: string, tenant: TenantKey, row: Row): void {
    const pkCols = this.pkCols.get(table);
    if (!pkCols) throw new Error(`isolation world: no primary key for ${table}`);
    const pk = Object.fromEntries(pkCols.map((c) => [c, row[c]]));
    ((this.rows[table] ??= {})[tenant] ??= []).push(pk);
    if (pkCols.length === 1 && typeof pk[pkCols[0]!] === 'string' && /^[0-9a-f-]{36}$/.test(pk[pkCols[0]!] as string)) {
      this.idSet.get(tenant)!.add(pk[pkCols[0]!] as string);
    }
  }
}

type CompetitorKey = 'X' | 'Y' | 'Z';
interface PublicRefs { competitorId: string; pageId: string; afterCaptureId: string; evidenceId: string; publicEventId: string; vertical: string }
interface AgencyRefs { agencyId: string; adminUser: string; adminContactId: string }

const competitorsSpec = (): Record<CompetitorKey, { id: string; name: string; domain: string; vertical: string; service: string }> => ({
  X: { id: IDS.competitorX, name: 'Smith HVAC', domain: 'smithhvac.example', vertical: 'hvac_plumbing', service: 'ac_tune_up' },
  Y: { id: IDS.competitorY, name: 'Bright Smiles', domain: 'brightsmiles.example', vertical: 'dental', service: 'teeth_cleaning' },
  Z: { id: COMPETITOR_Z, name: 'Zenith Heating', domain: 'zenithheating.example', vertical: 'hvac_plumbing', service: 'ac_tune_up' },
});
let competitorsMemo: ReturnType<typeof competitorsSpec> | undefined;
const competitors = () => (competitorsMemo ??= competitorsSpec());

async function seedUsers(b: WorldBuilder, db: Db): Promise<void> {
  const users = Object.values(worldUsers());
  const ids = sql.join(users.map((u) => sql`${u.userId}`), sql`, `);
  const emails = sql.join(users.map((u) => sql`${u.email}`), sql`, `);
  await db.execute(sql`DELETE FROM auth."user" WHERE id IN (${ids}) OR email IN (${emails})`);
  for (const u of users) {
    await db.execute(sql`INSERT INTO auth."user" (id, name, email, "emailVerified") VALUES (${u.userId}, ${u.userId}, ${u.email}, true)`);
  }
  // platform rows (class `platform`; not recorded per tenant)
  await b.ins('platform_admin', null, { id: hashUuid('platform_admin:operator'), user_id: worldUsers().operator.userId, role: 'owner', created_by: 'world' });
}

async function seedPublic(b: WorldBuilder, k: CompetitorKey): Promise<PublicRefs> {
  const comp = competitors()[k];
  const competitorId = comp.id;
  if (k === 'Z') {
    await b.ins('competitor', 'Z', { id: competitorId, name: `${comp.name} ${b.c(k)}`, domain: comp.domain });
  } else {
    const [row] = await b.db.update(competitor).set({ name: `${comp.name} ${b.c(k)}` }).where(eq(competitor.id, competitorId)).returning({ id: competitor.id });
    b.track('competitor', k, { id: row!.id });
  }
  const pageUrl = `https://${comp.domain}/pricing?ref=${b.c(k)}`;
  const page = await b.ins('tracked_page', k, { id: b.id('tracked_page', k), competitor_id: competitorId, url: pageUrl, page_type: 'pricing', source: 'nav', cadence: 'daily' });
  const pageId = page.id as string;
  const shot = (daysAgo: number) => ({
    id: b.id('capture', k), competitor_id: competitorId, tracked_page_id: pageId, source: 'web', url: `${pageUrl}&cap=${b.c(k)}`, status: 'ok',
    collector_version: 'world', captured_at: b.at(daysAgo, 9),
  });
  const before = await b.ins('capture', k, shot(4));
  const after = await b.ins('capture', k, shot(3));
  const afterCaptureId = after.id as string;
  let evidenceId = '';
  for (const cap of [before, after]) {
    const canary = b.c(k);
    const text = `${comp.name} pricing page ${canary}`;
    const key = `world/${k}/${cap.id as string}-${canary}.txt`;
    b.evidenceText.set(key, text);
    const ev = await b.ins('evidence', k, {
      id: b.id('evidence', k), capture_id: cap.id, kind: 'text', object_key: key, sha256: sha256(text), bytes: Buffer.byteLength(text), content_type: 'text/plain',
    });
    evidenceId = ev.id as string; // the after capture's evidence (cited by alerts, brief items, recommendations)
  }
  const blockText = `AC tune-up $79 ${b.c(k)}`;
  await b.ins('capture_block', k, {
    id: b.id('capture_block', k), capture_id: afterCaptureId, competitor_id: competitorId, tracked_page_id: pageId, ord: 0, block_key: 'b0', path: 'main', text: blockText, text_sha: sha256(blockText),
  });
  await b.ins('observation', k, { id: b.id('observation', k), competitor_id: competitorId, capture_id: afterCaptureId, kind: 'gbp', key: 'description', data: { value: b.c(k) } });
  await b.ins('price_point', k, {
    id: b.id('price_point', k), competitor_id: competitorId, tracked_page_id: pageId, vertical_id: comp.vertical, service_id: comp.service, amount: 79, unit: 'visit',
    qualifier: 'exact', raw: `$79 ${b.c(k)}`, context: `Tune-up special ${b.c(k)}`, first_seen_at: b.at(3, 9), last_seen_at: b.at(3, 9),
    first_capture_id: afterCaptureId, last_capture_id: afterCaptureId,
  });
  const reviewId = b.id('review', k);
  const reviewText = `Great service ${b.c(k)}`;
  await b.ins('review', k, {
    id: reviewId, competitor_id: competitorId, dedupe_key: `world-review-${k}`, rating: 4, text: reviewText, reviewer_hash: `world-reviewer-${k}`, posted_at: b.at(5),
    owner_answer: `Thanks ${b.c(k)}`, first_capture_id: afterCaptureId,
  });
  await b.ins('review_analysis', k, {
    review_id: reviewId, vertical_id: comp.vertical, competitor_id: competitorId, text_sha: sha256(reviewText), topics: [], sentiment: 1, confidence: 0.9, analysis_version: 1,
  });
  await b.ins('review_revision', k, { id: b.id('review_revision', k), review_id: reviewId, competitor_id: competitorId, rating: 3, text: `Earlier text ${b.c(k)}` });
  await b.ins('ad', k, {
    id: b.id('ad', k), competitor_id: competitorId, platform: 'google', external_id: `world-ad-${k}`, title: `Ad title ${b.c(k)}`, text: `Ad text ${b.c(k)}`,
    landing_url: `https://${comp.domain}/offer`, started_at: b.at(6), first_capture_id: afterCaptureId, last_capture_id: afterCaptureId,
  });
  // service_only, competitor-linked (no tenant column; recorded under the competitor tenant)
  await b.ins('competitor_source', k, { competitor_id: competitorId, source: 'google_reviews', last_status: `ok ${b.c(k)}` });
  await b.ins('vendor_task', k, { id: b.id('vendor_task', k), vendor: 'dataforseo', kind: 'reviews', external_task_id: `world-task-${k} ${b.c(k)}`, competitor_id: competitorId });
  await b.ins('volatile_block', k, { tracked_page_id: pageId, block_key: `clock ${b.c(k)}`, key_capture_id: afterCaptureId });
  // public (client_id NULL) change + event on this competitor (class tenant_client; recorded under the competitor tenant)
  const change = await b.ins('detected_change', k, {
    id: b.id('detected_change', k), competitor_id: competitorId, tracked_page_id: pageId, source: 'web', kind: 'modified', before_capture_id: before.id,
    after_capture_id: afterCaptureId, block_key: 'b0', before_text: `AC tune-up $99 ${b.c(k)}`, after_text: blockText, status: 'event', stage_version: 1, detected_at: b.at(3, 10),
  });
  const event = await b.ins('event', k, {
    id: b.id('event', k), competitor_id: competitorId, change_type: 'price_change', services: { [comp.vertical]: comp.service }, summary: `${comp.name} cut its tune-up to $79 ${b.c(k)}`,
    confidence: 0.9, occurred_at: b.at(3, 9), channels: ['web'],
  });
  await b.ins('event_change', k, { event_id: event.id, change_id: change.id });
  return { competitorId, pageId, afterCaptureId, evidenceId, publicEventId: event.id as string, vertical: comp.vertical };
}

async function seedAgency(b: WorldBuilder, a: 'A' | 'B', planId: string): Promise<AgencyRefs> {
  const agencyId = a === 'A' ? IDS.agencyA : IDS.agencyB;
  const admin = a === 'A' ? worldUsers().adminA : worldUsers().adminB;
  const lc = a.toLowerCase();
  const [ag] = await b.db.update(agency).set({ name: `Agency ${a} ${b.c(a)}` }).where(eq(agency.id, agencyId)).returning({ id: agency.id });
  b.track('agency', a, { id: ag!.id });
  // tenant_agency
  await b.ins('agency_onboarding', a, { agency_id: agencyId, source: 'legacy', completed_at: b.at(30) });
  await b.ins('agency_profile', a, { agency_id: agencyId, legal_name: `Agency ${a} LLC ${b.c(a)}`, website: `https://agency-${lc}.example`, contact_name: `Contact ${b.c(a)}` });
  await b.ins('intake_link', a, { agency_id: agencyId, slug: `world-agency-${lc}` });
  await b.ins('lead', a, {
    id: b.id('lead', a), agency_id: agencyId, source: 'agency_link', status: 'verified', contact_name: `Lead ${b.c(a)}`, email: `lead-${lc}@world.example`,
    message: `Please call ${b.c(a)}`, verified_at: b.at(1),
    lookup: { placeId: `world-lead-${lc}`, cid: null, title: `Lead business ${b.c(a)}`, address: null, city: 'Austin', category: 'HVAC contractor', phone: null, domain: null, rating: 4.5, votes: 10, lat: 30.27, lng: -97.74 },
  });
  await b.ins('playbook_override', a, { agency_id: agencyId, vertical_id: 'hvac_plumbing', playbook_id: 'world_play', title: `Override ${b.c(a)}`, template: `Do this ${b.c(a)}`, updated_by: admin.userId });
  await b.ins('api_token', a, {
    id: b.id('api_token', a), agency_id: agencyId, user_id: admin.userId, name: `Token ${b.c(a)}`, token_hash: sha256(`world-token-${a}`), token_prefix: `rm_w${lc}`, scope: 'manage',
  });
  await b.ins('oauth_grant_binding', a, {
    consent_id: `world-consent-${lc}`, id: b.id('oauth_grant_binding', a), oauth_client_id: `world-oauth-${lc} ${b.c(a)}`, agency_id: agencyId, user_id: admin.userId, scope: 'read',
  });
  await b.ins('audit_log', a, {
    id: b.id('audit_log', a), agency_id: agencyId, user_id: admin.userId, role: 'agency_admin', tool: 'list_clients', input_hash: b.c(a), outcome: 'ok', duration_ms: 3, channel: 'web',
  });
  // tenant_client table, agency-level rows (scope `all` / agency kb) — recorded under the agency tenant
  await b.ins('llm_call', a, {
    id: b.id('llm_call', a), agency_id: agencyId, task: 'brief_write', provider: 'openrouter', model: `world-model ${b.c(a)}`, input_tokens: 10, output_tokens: 5, cost_usd: 0.01, latency_ms: 100, ok: true,
  });
  await b.ins('vendor_call', a, { id: b.id('vendor_call', a), agency_id: agencyId, vendor: 'dataforseo', operation: `serp ${b.c(a)}`, units: 1, cost_usd: 0.02, latency_ms: 100, ok: true });
  const kb = await b.ins('kb_article', a, {
    id: b.id('kb_article', a), level: 'agency', agency_id: agencyId, kind: 'fact', title: `Agency fact ${b.c(a)}`, body_md: `Agency knowledge ${b.c(a)}`, status: 'published',
    client_visible: true, source: 'manual', created_by: admin.userId, updated_by: admin.userId,
  });
  await b.ins('kb_chunk', a, { id: b.id('kb_chunk', a), article_id: kb.id, level: 'agency', agency_id: agencyId, client_visible: true, ord: 0, text: `Agency knowledge ${b.c(a)}` });
  // service_only, agency-level
  // A is a paying agency; B is on its trial (so the operator's grant-pilot / extend-trial controls have a valid source state)
  await b.ins('agency_billing', a, {
    agency_id: agencyId, state: a === 'A' ? 'active' : 'trialing', plan_id: planId, stripe_customer_id: `cus_world_${lc}_${b.c(a)}`, ...(a === 'B' ? { trial_ends_at: b.at(-20) } : {}),
  });
  await b.ins('agency_billing_event', a, { id: b.id('agency_billing_event', a), agency_id: agencyId, from_state: 'trialing', to_state: 'active', reason: `Card added ${b.c(a)}`, actor: 'system' });
  await b.ins('agency_connect', a, { agency_id: agencyId, stripe_account_id: `acct_world_${lc}_${b.c(a)}`, status: 'connected', charges_enabled: true, details_submitted: true, connected_at: b.at(20) });
  await b.ins('agency_daily_stat', a, { agency_id: agencyId, day: '2026-01-01', clients_active: a === 'A' ? 2 : 1, agency_seats: 1, billing_state: 'active' });
  await b.ins('agency_webhook', a, { id: b.id('agency_webhook', a), agency_id: agencyId, kind: 'slack', url: `https://hooks.slack.example/world-${lc}?c=${b.c(a)}`, created_by: admin.userId });
  await b.ins('billing_notice', a, { id: b.id('billing_notice', a), agency_id: agencyId, kind: 'trial_ending', params: { note: b.c(a) }, dedupe_key: `world-notice-${lc} ${b.c(a)}`, audience: 'agency' });
  const contact = await b.ins('contact', a, { id: b.id('contact', a), agency_id: agencyId, role: 'agency_admin', name: `Admin ${a} ${b.c(a)}`, email: admin.email, user_id: admin.userId });
  await b.ins('invitation', a, {
    id: b.id('invitation', a), agency_id: agencyId, email: `${b.c(a)}@world.example`, role: 'account_manager', client_scope: [a === 'A' ? IDS.clientA1 : IDS.clientB1],
    invited_by: admin.userId, expires_at: b.at(-7),
  });
  const agencyMembers: UserSpec[] = a === 'A' ? [worldUsers().adminA, worldUsers().amA, worldUsers().operator] : [worldUsers().adminB];
  for (const u of agencyMembers) {
    await b.ins('membership', a, {
      id: b.id('membership', a), user_id: u.userId, agency_id: agencyId, role: u.role, client_scope: u.clientScope === 'all' ? null : u.clientScope,
      contact_id: u === admin ? contact.id : null, created_by: `world ${b.c(a)}`,
    });
  }
  const runbook = await b.ins('runbook', a, { id: b.id('runbook', a), level: 'agency', agency_id: agencyId });
  // valid play content (`playContentSchema`); `play:world_play_2` is agency-only, so a client can adopt it
  await b.ins('runbook_item', a, { runbook_id: runbook.id, item_key: 'play:world_play', kind: 'play', content: { trigger: 'map_climb', title: `Agency play ${b.c(a)}`, template: 'Check the map pack this week.' }, updated_by: admin.userId });
  await b.ins('runbook_item', a, { runbook_id: runbook.id, item_key: 'play:world_play_2', kind: 'play', content: { trigger: 'price_change', title: `Agency price play ${b.c(a)}`, template: 'Review your prices.' }, updated_by: admin.userId });
  await b.ins('support_session', a, {
    id: b.id('support_session', a), platform_user_id: worldUsers().operator.userId, agency_id: agencyId, reason: `Support check ${b.c(a)}`, started_at: b.at(2), expires_at: b.at(2, 1),
    ended_at: b.at(2, 1), end_reason: 'exit',
  });
  await b.ins('vertical_draft', a, { place_id: `world-place-${lc}`, agency_id: agencyId, draft: { name: `Draft vertical ${b.c(a)}` } });
  return { agencyId, adminUser: admin.userId, adminContactId: contact.id as string };
}

interface ClientSpec {
  key: 'A1' | 'A2' | 'B1'; clientId: string; agency: AgencyRefs; pub: PublicRefs; owner: UserSpec | null; viewer: UserSpec | null; askUser: string;
  /** A second Ask thread's owner (A1: the agency admin, so the tool suite's per-user thread controls run as adminA). */
  secondAskUser?: string;
}

async function seedClient(b: WorldBuilder, s: ClientSpec): Promise<void> {
  const { key: t, clientId } = s;
  const agencyId = s.agency.agencyId;
  const competitorId = s.pub.competitorId;
  const lc = t.toLowerCase();
  const base = { agency_id: agencyId, client_id: clientId };

  // a complete profile (keywords, service area, place id), so discovery / rank settings controls can run
  const [cl] = await b.db.update(client).set({
    name: `${t} Client ${b.c(t)}`, features: [...FEATURES], keywords: ['ac repair'], placeId: `world-self-${lc}`,
    serviceArea: { center: { lat: 30.27, lng: -97.74 }, radiusKm: 10, zips: ['78701'] },
  }).where(eq(client.id, clientId)).returning({ id: client.id });
  b.track('client', t, { id: cl!.id });
  // one possible ad-account match awaiting confirmation (confirm_ad_match / remove_ad_match)
  await b.db.execute(sql`UPDATE client_competitor SET pending_ad_matches = ${JSON.stringify([{ platform: 'google', accountId: 'AR-world-1', name: 'Smith ads', strength: 'strong' }])}::jsonb
    WHERE client_id = ${clientId} AND competitor_id = ${competitorId}`);
  b.track('client_competitor', t, { client_id: clientId, competitor_id: competitorId });

  // tenant_client
  await b.ins('client_setup', t, {
    ...base, source: 'staff', completed_at: b.at(30), last_changed_by: s.agency.adminUser,
    lookup: { placeId: `world-self-${lc}`, cid: null, title: `${t} Self ${b.c(t)}`, address: null, city: 'Austin', category: null, phone: null, domain: null, rating: null, votes: null, lat: 30.27, lng: -97.74 },
  });
  await b.ins('competitor_signal', t, { ...base, competitor_id: competitorId, tier: 'top', overlap: 0.8, activity: 0.7, signals: {} });
  const run = await b.ins('discovery_run', t, { id: b.id('discovery_run', t), ...base, status: 'done', trigger: 'manual', keywords: [`ac repair ${b.c(t)}`], kept: 1, started_at: b.at(10), finished_at: b.at(10) });
  await b.ins('competitor_suggestion', t, {
    id: b.id('competitor_suggestion', t), ...base, name: `Suggested rival ${b.c(t)}`, place_id: `world-sugg-${lc}`, appearances: 3, overlap_score: 0.5, run_id: run.id, tier: 'watch',
  });
  const scan = await b.ins('rank_scan', t, { id: b.id('rank_scan', t), ...base, status: 'done', trigger: 'manual', snapshots: 1, finished_at: b.at(2, 1), keywords: [`ac repair ${b.c(t)}`], requested_by: s.agency.adminUser });
  await b.ins('rank_snapshot', t, {
    id: b.id('rank_snapshot', t), ...base, keyword: `ac repair ${b.c(t)}`, lat: 30.27, lng: -97.74, scan_id: scan.id, captured_at: b.at(2, 1),
    results: [{ rank: 1, placeId: null, cid: null, domain: null, title: `Map result ${b.c(t)}` }],
  });
  await b.ins('rank_map_image', t, { ...base, settings_hash: `world-${lc} ${b.c(t)}`, object_key: `world/rank/${lc}.png`, bounds: { west: -97.8, south: 30.2, east: -97.7, north: 30.3 }, width: 640, height: 640 });
  const change = await b.ins('detected_change', t, {
    id: b.id('detected_change', t), competitor_id: competitorId, source: 'rank', kind: 'modified', rank_scan_id: scan.id, block_key: 'rank:ac repair', before_text: `rank 4 ${b.c(t)}`,
    after_text: `rank 2 ${b.c(t)}`, status: 'event', stage_version: 1, detected_at: b.at(2, 2), ...base,
  });
  const event = await b.ins('event', t, {
    id: b.id('event', t), competitor_id: competitorId, change_type: 'rank_change', summary: `Rival climbed the map for ${t} ${b.c(t)}`, confidence: 0.9, occurred_at: b.at(2, 2), channels: ['rank'], ...base,
  });
  const eventId = event.id as string;
  await b.ins('event_change', t, { event_id: eventId, change_id: change.id });
  await b.ins('event_score', t, { ...base, event_id: eventId, score: 80, route: 'alert', factors: FACTORS, pack_version: 1, scored_at: b.at(2, 3) });
  const alert = await b.ins('alert', t, {
    id: b.id('alert', t), ...base, competitor_id: competitorId, event_id: eventId, score: 80, headline: `Alert headline ${b.c(t)}`, body: `Alert body ${b.c(t)}`,
    evidence_ids: [s.pub.evidenceId], status: 'pending_review', mode: 'after_am_check',
  });
  await b.ins('alert_event', t, { alert_id: alert.id, ...base, event_id: eventId });
  const move = await b.ins('move', t, {
    id: b.id('move', t), ...base, competitor_id: competitorId, move_type: 'map_climb', status: 'active', confidence: 0.8, summary: `Move summary ${b.c(t)}`,
    details: { eventCount: 1, channels: ['rank'], facts: { points: 3 } }, rule_version: 1, first_detected_at: b.at(2, 3), last_held_at: b.at(1), last_evidence_at: b.at(2, 2),
  });
  await b.ins('move_event', t, { move_id: move.id, event_id: eventId });
  const brief = await b.ins('brief', t, {
    id: b.id('brief', t), ...base, delivery_date: b.date(0), period_start: b.at(7), period_end: b.at(0), status: 'ready', summary: `Brief summary ${b.c(t)}`, generated_at: b.at(0),
  });
  const item = await b.ins('brief_item', t, {
    id: b.id('brief_item', t), brief_id: brief.id, ...base, ord: 1, competitor_id: competitorId, headline: `Item headline ${b.c(t)}`, what_changed: `What changed ${b.c(t)}`,
    why_it_matters: `Why it matters ${b.c(t)}`, recommended_action: `Do this ${b.c(t)}`, confidence: 0.9, effort: 'M', impact: 'M', event_ids: [s.pub.publicEventId], move_id: move.id,
    evidence_ids: [s.pub.evidenceId],
  });
  await b.ins('recommendation', t, {
    id: b.id('recommendation', t), ...base, title: `Recommendation ${b.c(t)}`, rationale: `Because ${b.c(t)}`, evidence_ids: [s.pub.evidenceId], event_ids: [s.pub.publicEventId],
    brief_item_id: item.id, effort: 'M', impact: 'M', owner: 'agency', status: 'todo', source: 'brief',
  });
  await b.ins('feedback', t, { id: b.id('feedback', t), ...base, subject_type: 'brief_item', subject_id: item.id, kind: 'rating', after: { rating: 5 }, reason: `Useful ${b.c(t)}`, actor: s.agency.adminUser });
  const quarterStart = new Date(b.at(100));
  const q = Math.floor(quarterStart.getUTCMonth() / 3);
  await b.ins('trend_report', t, {
    id: b.id('trend_report', t), ...base, quarter: `${quarterStart.getUTCFullYear()}-Q${q + 1}`, period_start: b.at(100), period_end: b.at(10), status: 'ready',
    data: { quarter: `${quarterStart.getUTCFullYear()}-Q${q + 1}`, windowDays: 90, businesses: [], eventsByType: {}, moves: [{ moveType: 'map_climb', competitorName: b.c(t), status: 'active', firstDetectedAt: b.at(20) }], briefsSent: 1, alertsDelivered: 1, recommendations: { created: 1, done: 0, inProgress: 0, dismissed: 0 } },
  });
  await b.ins('prospect_report', t, {
    id: b.id('prospect_report', t), ...base, status: 'ready', finished_at: b.at(15),
    data: { generatedAt: b.at(15), keywords: ['ac repair'], points: 9, scanId: null, businesses: [], notes: [`Prospect note ${b.c(t)}`] },
  });
  const thread = await b.ins('ask_thread', t, { id: b.id('ask_thread', t), ...base, user_id: s.askUser, title: `Thread ${b.c(t)}` });
  await b.ins('ask_message', t, { id: b.id('ask_message', t), thread_id: thread.id, ...base, user_id: s.askUser, role: 'user', content: `What changed? ${b.c(t)}` });
  await b.ins('ask_starter', t, { ...base, questions: [`Starter question ${b.c(t)}`] });
  const kb = await b.ins('kb_article', t, {
    id: b.id('kb_article', t), level: 'client', ...base, kind: 'fact', title: `Client fact ${b.c(t)}`, body_md: `Client knowledge ${b.c(t)}`, status: 'published', source: 'manual',
    created_by: s.agency.adminUser, updated_by: s.agency.adminUser,
  });
  await b.ins('kb_chunk', t, { id: b.id('kb_chunk', t), article_id: kb.id, level: 'client', ...base, client_visible: true, ord: 0, text: `Client knowledge ${b.c(t)}` });
  await b.ins('llm_call', t, {
    id: b.id('llm_call', t), ...base, task: 'brief_write', provider: 'openrouter', model: `world-model ${b.c(t)}`, input_tokens: 10, output_tokens: 5, cost_usd: 0.01, latency_ms: 100, ok: true,
  });
  await b.ins('vendor_call', t, { id: b.id('vendor_call', t), ...base, vendor: 'dataforseo', operation: `maps ${b.c(t)}`, units: 1, cost_usd: 0.02, latency_ms: 100, ok: true });

  // service_only, client-level
  await b.ins('client_billing', t, {
    ...base, enabled: true, price_cents: 9900, billed_price_cents: 9900, state: 'active', stripe_customer_id: `cus_world_${lc}`, stripe_price_id: `price_world_${lc}`,
    stripe_subscription_id: `sub_world_${lc}_${b.c(t)}`, last_paid_at: b.at(5),
  });
  const ownerContact = await b.ins('contact', t, {
    id: b.id('contact', t), ...base, role: 'client_owner', name: `Owner ${t} ${b.c(t)}`, email: s.owner?.email ?? `owner-${lc}@world.example`, user_id: s.owner?.userId ?? null,
  });
  const viewerContact = s.viewer
    ? await b.ins('contact', t, { id: b.id('contact', t), ...base, role: 'client_viewer', name: `Viewer ${t} ${b.c(t)}`, email: s.viewer.email, user_id: s.viewer.userId })
    : null;
  for (const [u, ct] of [[s.owner, ownerContact], [s.viewer, viewerContact]] as const) {
    if (!u || !ct) continue;
    await b.ins('membership', t, { id: b.id('membership', t), user_id: u.userId, ...base, role: u.role, contact_id: ct.id, created_by: `world ${b.c(t)}` });
  }
  await b.ins('notification', t, {
    id: b.id('notification', t), ...base, contact_id: ownerContact.id, channel: 'in_app', kind: 'alert', subject_type: 'alert', subject_id: alert.id,
    dedupe_key: `world-notification-${lc} ${b.c(t)}`, title: `Notification ${b.c(t)}`, body: `Notification body ${b.c(t)}`, status: 'sent', sent_at: b.at(1),
  });
  await b.ins('notification_pref', t, { contact_id: ownerContact.id, agency_id: agencyId, kind: 'alert', channel: 'email', enabled: true });
  // emails are stored lower-cased (`normalizeEmail`), so a client invitation carries no canary (resend matches on lower(email))
  await b.ins('invitation', t, {
    id: b.id('invitation', t), ...base, email: `invite-${lc}@world.example`, role: 'client_viewer', invited_by: s.agency.adminUser, expires_at: b.at(-7),
  });
  await b.ins('billing_notice', t, { id: b.id('billing_notice', t), ...base, kind: 'client_payment_failed', params: { note: b.c(t) }, dedupe_key: `world-notice-${lc} ${b.c(t)}`, audience: 'client' });
  const sample = await b.ins('decision_sample', t, {
    id: b.id('decision_sample', t), task: 'change_triage', reason: 'shadow', ...base, state: { text: b.c(t) }, final_answers: {},
    questions: { q1: { type: 'noul', instructions: 'Is this a real change?' } },
  });
  await b.ins('decision_label', t, { sample_id: sample.id, question_key: 'q1', value: `yes ${b.c(t)}`, source: 'human', labeled_by: 'world' });
  await b.ins('decision_review', t, { id: b.id('decision_review', t), subject_type: 'detected_change', subject_id: change.id, keys: ['q1'], answers: { q1: b.c(t) }, sample_id: sample.id });
  await b.ins('score_failure', t, { event_id: eventId, ...base, attempts: 1, error: `Scoring failed ${b.c(t)}` });
  await b.ins('spend_guard_event', t, { id: b.id('spend_guard_event', t), kind: 'client_reached', ...base, month: `${b.date(0).slice(0, 7)}-01`, scope: 'total', observed_usd: 10, limit_usd: 10, note: `Reached ${b.c(t)}` });
  const runbook = await b.ins('runbook', t, { id: b.id('runbook', t), level: 'client', ...base });
  await b.ins('runbook_item', t, {
    runbook_id: runbook.id, item_key: 'play:world_play', kind: 'play', content: { trigger: 'map_climb', title: `Client play ${b.c(t)}`, template: 'Check the map pack this week.' }, updated_by: s.agency.adminUser,
  });
  if (s.secondAskUser) {
    // seeded last so the client's earlier canaries keep their numbers
    const second = await b.ins('ask_thread', t, { id: b.id('ask_thread', t), ...base, user_id: s.secondAskUser, title: `Thread ${b.c(t)}` });
    await b.ins('ask_message', t, { id: b.id('ask_message', t), thread_id: second.id, ...base, user_id: s.secondAskUser, role: 'user', content: `Who moved? ${b.c(t)}` });
  }
  // a soft-deleted thread (15c-2b): tenant reads filter `deleted_at IS NULL`, operators still see it; seeded after the
  // live threads so `ask_thread` row indexes 0 (and A1's 1) stay the live ones
  const gone = await b.ins('ask_thread', t, { id: b.id('ask_thread', t), ...base, user_id: s.askUser, title: `Deleted thread ${b.c(t)}`, deleted_at: b.at(2) });
  await b.ins('ask_message', t, { id: b.id('ask_message', t), thread_id: gone.id, ...base, user_id: s.askUser, role: 'user', content: `Deleted question ${b.c(t)}` });
}

/** Platform rows for the operator tools (no tenant canaries: they are platform data, invisible to every app_user). */
async function seedPlatform(b: WorldBuilder, db: Db): Promise<IsolationWorld['platformIds']> {
  await seedPlatformCostServices(db);
  const unreviewedVertical = 'world_pool_care';
  await b.ins('vertical', null, {
    id: unreviewedVertical, name: 'Pool Care', status: 'unreviewed', version: 1, gbp_categories: ['pool cleaning service'], config: {}, created_by_agency_id: IDS.agencyA,
  });
  await b.ins('vertical_category', null, { category_lc: 'pool cleaning service', vertical_id: unreviewedVertical, kind: 'primary' });
  for (const [id, name] of [['pool_repair', 'Pool repair'], ['pool_opening', 'Pool opening']]) {
    await b.ins('business_area', null, { vertical_id: unreviewedVertical, id, name, status: 'unreviewed', created_by_agency_id: IDS.agencyA });
  }
  const lead = await b.ins('lead', null, {
    id: hashUuid('lead:pool'), source: 'platform', status: 'verified', contact_name: 'Pool lead', email: 'pool-lead@world.example', verified_at: b.at(1),
    lookup: { placeId: 'world-pool-lead', cid: null, title: 'Pool lead business', address: null, city: 'Austin', category: 'HVAC contractor', phone: null, domain: null, rating: null, votes: null, lat: 30.27, lng: -97.74 },
  });
  const code = await b.ins('discount_code', null, {
    id: hashUuid('discount_code:world'), code: 'WORLD10', stripe_coupon_id: 'coupon_world', stripe_promotion_code_id: 'promo_world', percent_off: 10, applies_to: 'base', duration: 'once',
    created_by: 'world',
  });
  const link = await b.ins('agency_invite_link', null, {
    id: hashUuid('agency_invite_link:world'), token_hash: sha256('world-invite-link'), token_prefix: 'rm_inv_w', offer: 'trial', expires_at: b.at(-14), created_by: 'world',
  });
  const item = await b.ins('platform_cost_item', null, { id: hashUuid('platform_cost_item:world'), name: 'World hosting', kind: 'one_off', amount_usd: 10, starts_on: b.date(30), created_by: 'world' });
  const proposal = await b.ins('topic_proposal', null, {
    id: hashUuid('topic_proposal:world'), vertical_id: 'hvac_plumbing', topic_id: 'world_topic', name: 'Wait times', description: 'Reviews about waiting', other_count: 3,
  });
  const wl = (key: string, values: Record<string, unknown>) =>
    b.ins('waitlist_entry', null, {
      id: hashUuid(`waitlist_entry:${key}`), contact_name: `World ${key}`, org_name: `World ${key} org`, email: `${key}@world.example`, ip_hash: 'world-ip',
      email_confirmed_at: b.at(-1), ...values,
    });
  const wlAgency = await wl('agency', { kind: 'agency', status: 'new' });
  const wlSample = await wl('agency-sample', {
    kind: 'agency', sample_requested: true, sample_status: 'requested', sample_business_name: 'World Sample HVAC', sample_location: 'Austin, TX',
  });
  const wlBusiness = await wl('business', { kind: 'business', vertical_id: 'hvac_plumbing' });
  const wlUnconfirmed = await wl('unconfirmed', { kind: 'agency', email_confirmed_at: null });
  return {
    unreviewedVertical, unreviewedArea: 'pool_repair', unreviewedArea2: 'pool_opening', poolLead: lead.id as string, discountCode: code.id as string, inviteLink: link.id as string,
    costItem: item.id as string, topicProposal: proposal.id as string,
    waitlistAgency: wlAgency.id as string, waitlistAgencySample: wlSample.id as string, waitlistBusiness: wlBusiness.id as string, waitlistUnconfirmed: wlUnconfirmed.id as string,
  };
}

/** Seeds the isolation world into an emptied database (call `truncateAll(owner)` first). */
export async function seedIsolationWorld(owner: Db): Promise<IsolationWorld> {
  const b = new WorldBuilder(owner);
  await b.loadPrimaryKeys();
  await seedUsers(b, owner);
  const plan = await b.ins('plan', null, {
    id: hashUuid('plan:world'), code: 'standard', version: 1, name: 'World plan', base_price_cents: 22900, included_seats: 3, seat_price_cents: 9900, trial_days: 30,
    is_current: true, created_by: 'world', features: [...PLAN_FEATURES],
  });

  await seedTenancy(owner);
  const pub = { X: await seedPublic(b, 'X'), Y: await seedPublic(b, 'Y'), Z: await seedPublic(b, 'Z') };
  await owner.insert(clientCompetitor).values({ agencyId: IDS.agencyB, clientId: IDS.clientB1, competitorId: COMPETITOR_Z });
  b.track('client_competitor', 'B1', { client_id: IDS.clientB1, competitor_id: COMPETITOR_Z });

  const agencyA = await seedAgency(b, 'A', plan.id as string);
  const agencyB = await seedAgency(b, 'B', plan.id as string);
  await seedClient(b, { key: 'A1', clientId: IDS.clientA1, agency: agencyA, pub: pub.X, owner: worldUsers().ownerA1, viewer: worldUsers().viewerA1, askUser: worldUsers().ownerA1.userId,
    secondAskUser: worldUsers().adminA.userId,
  });
  await seedClient(b, { key: 'A2', clientId: IDS.clientA2, agency: agencyA, pub: pub.Y, owner: worldUsers().ownerA2, viewer: null, askUser: worldUsers().ownerA2.userId });
  await seedClient(b, { key: 'B1', clientId: IDS.clientB1, agency: agencyB, pub: pub.X, owner: null, viewer: null, askUser: worldUsers().adminB.userId });
  const platformIds = await seedPlatform(b, owner);

  const users = Object.fromEntries(
    Object.entries(worldUsers()).map(([k, u]) => [k, { userId: u.userId, email: u.email, agencyId: u.agencyId, role: u.role, clientScope: u.clientScope }]),
  ) as IsolationWorld['users'];
  const ctxOf = (u: UserSpec): AccessContext =>
    createAccessContext({ agencyId: u.agencyId, userId: u.userId, role: u.role, clientScope: u.clientScope, features: [...FEATURES], planFeatures: [...PLAN_FEATURES] });
  const canaries = b.canaryList;
  const idSet = b.idSet;
  return {
    ids: { ...IDS, competitorZ: COMPETITOR_Z },
    users,
    ctx: (user) => ctxOf(worldUsers()[user]),
    operatorCtx: () => ctxOf(worldUsers().operator),
    rows: b.rows,
    canaries: (tenant) => [...canaries.get(tenant)!],
    idsOf: (tenant) => [...idSet.get(tenant)!],
    forbidden: (user) => [...FORBIDDEN[user]],
    evidenceText: b.evidenceText,
    platformIds,
  };
}
