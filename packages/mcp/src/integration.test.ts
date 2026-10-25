import { createAccessContext, type AccessContext, type Feature } from '@cs/core';
import { agency, alert, apiToken, auditLog, brief, briefItem, client as clientTable, createAuditSink, membership, oauthGrantBinding } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { createToolRegistry, type ToolDeps } from '@cs/tools';
import { dbs, resetWorkspace, seedCapture, seedEvent, seedReview } from '@cs/tools/test-fixtures';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { and, eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleMcpRequest, type McpHandlerDeps } from './handler';
import { RATE_LIMITS } from './rate-limit';

/** Real registry (real audit sink), real PATs minted through `create_api_token`, the official SDK client over an in-process fetch. */
const deps: ToolDeps = { app: dbs.app, service: dbs.service };
const registry = createToolRegistry(deps, { audit: createAuditSink(dbs.service) });
const d: McpHandlerDeps = { service: dbs.service, registry, deps, appUrl: 'https://app.example', verifyOAuth: null };
const MCP_URL = new URL('https://app.example/mcp');
const inProcessFetch = (url: string | URL, init?: RequestInit) => handleMcpRequest(new Request(url, init), d);

const READ = [
  'list_clients', 'get_client_profile', 'list_client_competitors', 'get_competitor_profile', 'get_competitor_timeline', 'search_events', 'get_event',
  'get_evidence', 'compare_snapshots', 'get_price_matrix', 'get_price_history', 'list_ads', 'get_ad_activity', 'get_topic_benchmark', 'search_reviews',
  'get_rating_trend', 'get_geogrid', 'get_rank_trend', 'get_share_of_voice', 'list_moves', 'get_move', 'list_briefs', 'get_brief', 'list_recommendations', 'list_alerts', 'get_usage',
  'search', 'fetch', 'search_knowledge', 'get_competitor_signals', 'list_verticals',
];
/** Exact client-role lists (owner/viewer), derived once from the registry and reviewed: no agency-only, manage or admin tools. */
const CLIENT_READ = [
  'compare_snapshots', 'fetch', 'get_ad_activity', 'get_brief', 'get_client_profile', 'get_competitor_profile', 'get_competitor_signals', 'get_competitor_timeline', 'get_event',
  'get_evidence', 'get_geogrid', 'get_move', 'get_price_history', 'get_price_matrix', 'get_rank_trend', 'get_rating_trend', 'get_share_of_voice', 'get_topic_benchmark', 'list_ads',
  'list_alerts', 'list_briefs', 'list_client_competitors', 'list_moves', 'list_recommendations', 'list_verticals', 'search', 'search_events', 'search_knowledge', 'search_reviews',
];
const CLIENT_FEEDBACK = ['add_recommendation', 'submit_feedback', 'update_recommendation_status'];
const FEEDBACK = ['submit_feedback', 'update_recommendation_status', 'add_recommendation'];
const MANAGE = ['set_alert_rules', 'update_client_profile', 'set_page_pin', 'run_prospect_snapshot'];

const USERS = {
  admin: { id: 'u-admin', agencyId: IDS.agencyA, role: 'agency_admin', clientId: null },
  owner: { id: 'u-owner', agencyId: IDS.agencyA, role: 'client_owner', clientId: IDS.clientA1 },
  viewer: { id: 'u-viewer', agencyId: IDS.agencyA, role: 'client_viewer', clientId: IDS.clientA1 },
  adminB: { id: 'u-adminb', agencyId: IDS.agencyB, role: 'agency_admin', clientId: null },
  /** Account manager scoped to A1 only (membership.client_scope). */
  am: { id: 'u-am', agencyId: IDS.agencyA, role: 'account_manager', clientId: null, scope: [IDS.clientA1] },
} as const;
type Who = keyof typeof USERS;

const webCtx = (w: Who): AccessContext => {
  const u = USERS[w];
  return createAccessContext({ agencyId: u.agencyId, userId: u.id, role: u.role, clientScope: u.clientId ? [u.clientId] : 'all', features: ['mcp'] as Feature[] });
};

async function mint(w: Who, scope: 'read' | 'feedback' | 'manage'): Promise<{ id: string; token: string }> {
  return (await registry.invoke(webCtx(w), 'create_api_token', { name: `it-${w}`, scope })) as { id: string; token: string };
}

const open: Client[] = [];
async function connect(token: string, handlerDeps: McpHandlerDeps = d): Promise<Client> {
  const fetchIn = (url: string | URL, init?: RequestInit) => handleMcpRequest(new Request(url, init), handlerDeps);
  const transport = new StreamableHTTPClientTransport(MCP_URL, { fetch: fetchIn as typeof fetch, requestInit: { headers: { authorization: `Bearer ${token}` } } });
  const c = new Client({ name: 'it', version: '1.0.0' });
  await c.connect(transport);
  open.push(c);
  return c;
}

type TextResult = { isError?: boolean; content: { type: string; text: string }[] };
const call = async (c: Client, name: string, args: Record<string, unknown> = {}) => (await c.callTool({ name, arguments: args })) as TextResult;
const json = (r: TextResult) => JSON.parse(r.content[0]!.text) as Record<string, unknown>;
const errorOf = (r: TextResult) => {
  expect(r.isError).toBe(true);
  return json(r);
};
const names = async (c: Client) => (await c.listTools()).tools.map((t) => t.name).sort();
const NOT_FOUND = { code: 'not_found', message: 'Not found' };

const rawPost = (token: string | null, method: string, handlerDeps: McpHandlerDeps = d) => handleMcpRequest(new Request(MCP_URL, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method }),
}), handlerDeps);

const period = { periodStart: new Date('2026-09-28T00:00:00Z'), periodEnd: new Date('2026-10-04T00:00:00Z') };

beforeEach(async () => {
  await resetWorkspace();
  await dbs.owner.execute(sql`truncate auth."user", auth.verification, auth."rateLimit" cascade`);
  for (const u of Object.values(USERS)) {
    await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${u.id}, ${u.id}, ${`${u.id}@e.co`}, true)`);
    await dbs.service.insert(membership).values({ userId: u.id, agencyId: u.agencyId, role: u.role, clientId: u.clientId, clientScope: 'scope' in u ? [...u.scope] : null, createdBy: 't' });
  }
  await dbs.owner.update(clientTable).set({ features: ['dashboard', 'mcp'] }).where(eq(clientTable.id, IDS.clientA1));
});
afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.close()));
});

describe('/mcp end to end with the SDK client', () => {
  it('initialize returns productName', async () => {
    const { token } = await mint('admin', 'read');
    expect((await connect(token)).getServerVersion()).toMatchObject({ name: 'Rival Monday' });
    await dbs.owner.update(agency).set({ branding: { displayName: 'Acme Intel' } }).where(eq(agency.id, IDS.agencyA));
    expect((await connect(token)).getServerVersion()).toMatchObject({ name: 'Acme Intel' });
  });

  it('tools/list per role x scope', async () => {
    const lists: Record<string, string[]> = {};
    for (const [who, scope] of [['admin', 'read'], ['admin', 'feedback'], ['admin', 'manage'], ['owner', 'read'], ['owner', 'feedback'], ['viewer', 'read']] as const) {
      lists[`${who}/${scope}`] = await names(await connect((await mint(who, scope)).token));
    }
    expect(lists['admin/read']).toEqual([...READ].sort());
    expect(lists['admin/feedback']).toEqual([...READ, ...FEEDBACK].sort());
    expect(lists['admin/manage']).toEqual([...READ, ...FEEDBACK, ...MANAGE].sort());
    // Client roles never see manage tools or agency-only tools.
    for (const k of ['owner/read', 'owner/feedback', 'viewer/read']) {
      for (const t of MANAGE) expect(lists[k]).not.toContain(t);
      expect(lists[k]).not.toContain('list_clients');
      expect(lists[k]).toContain('search');
    }
    for (const t of FEEDBACK) expect(lists['owner/read']).not.toContain(t);
    expect(lists['owner/feedback']).toContain('submit_feedback');
    expect(lists['viewer/read']).toEqual(lists['owner/read']);
    expect(lists['owner/read']).toEqual([...CLIENT_READ].sort());
    expect(lists['owner/feedback']).toEqual([...CLIENT_READ, ...CLIENT_FEEDBACK].sort());
    expect(lists['viewer/read']).toEqual([...CLIENT_READ].sort());
    for (const t of lists['owner/feedback']!) expect(lists['admin/feedback']).toContain(t);
  });

  it('exposes topicId (not themeId) on search_reviews, and the old get_theme_benchmark is an unknown tool', async () => {
    const { token } = await mint('admin', 'read');
    const c = await connect(token);
    const sr = (await c.listTools()).tools.find((t) => t.name === 'search_reviews')!;
    const props = Object.keys((sr.inputSchema as { properties: Record<string, unknown> }).properties);
    expect(props).toContain('topicId');
    expect(props).not.toContain('themeId');
    const old = await call(c, 'get_theme_benchmark', { clientId: IDS.clientA1 }).then((r) => r, (e: Error) => ({ isError: true, content: [{ text: e.message }] }));
    expect(old.isError).toBe(true);
    expect(JSON.stringify(old)).toMatch(/unknown tool|not found|not_found/i);
  });

  it('tools/call writes an audit row with channel mcp and token_id', async () => {
    const { id, token } = await mint('admin', 'read');
    const c = await connect(token);
    expect((await call(c, 'list_clients')).isError).toBeUndefined();
    const rows = await dbs.service.select().from(auditLog).where(and(eq(auditLog.tool, 'list_clients'), eq(auditLog.tokenId, id)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ channel: 'mcp', tokenId: id, userId: USERS.admin.id, agencyId: IDS.agencyA, outcome: 'ok' });
    // The plaintext token is never in the audit trail.
    expect(JSON.stringify(await dbs.service.select().from(auditLog))).not.toContain(token);
  });

  it('missing token gives 401 with the resource-metadata header', async () => {
    for (const bearer of [null, 'rm_pat_garbage']) {
      const res = await rawPost(bearer, 'tools/list');
      expect(res.status).toBe(401);
      expect(res.headers.get('www-authenticate')).toBe('Bearer resource_metadata="https://app.example/.well-known/oauth-protected-resource"');
    }
    // The SDK client surfaces it as a failure at connect.
    await expect(connect('rm_pat_garbage')).rejects.toThrow();
  });

  it('revocation applies on the next call (401)', async () => {
    const { id, token } = await mint('admin', 'read');
    const c = await connect(token);
    expect((await call(c, 'list_clients')).isError).toBeUndefined();
    await registry.invoke(webCtx('admin'), 'revoke_api_token', { tokenId: id });
    await expect(call(c, 'list_clients')).rejects.toThrow();
    expect((await rawPost(token, 'tools/list')).status).toBe(401);
  });

  it('cross-agency search/fetch return nothing/not_found', async () => {
    const ev = await seedEvent({ score: 80, route: 'alert', ageDays: 1, summary: 'Smith HVAC cut its furnace repair price' });
    const a = await connect((await mint('admin', 'read')).token);
    const found = json(await call(a, 'search', { query: 'furnace repair', clientId: IDS.clientA1 })) as { results: { id: string }[] };
    expect(found.results.map((x) => x.id)).toEqual([`event:${ev.eventId}`]);

    const b = await connect((await mint('adminB', 'read')).token);
    expect(json(await call(b, 'search', { query: 'furnace repair' }))).toEqual({ results: [] });
    expect(errorOf(await call(b, 'fetch', { id: `event:${ev.eventId}` }))).toEqual(NOT_FOUND);
  });

  it('retracted event, undelivered alert, upsell filtered for a client token', async () => {
    const live = await seedEvent({ score: 80, route: 'alert', ageDays: 1, summary: 'Smith HVAC cut its furnace repair price' });
    const retracted = await seedEvent({ score: 80, route: 'alert', ageDays: 1, summary: 'Smith HVAC furnace repair retracted claim', retracted: true });
    const [al] = await dbs.owner.insert(alert).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId: live.eventId, score: 82, headline: 'Furnace repair pending alert', body: 'Smith HVAC moved.',
      status: 'pending_review', mode: 'after_am_check', evidenceIds: [],
    }).returning();
    const [b] = await dbs.owner.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, ...period, deliveryDate: '2026-10-05', status: 'sent', summary: 'Quiet week.' }).returning();
    const [item] = await dbs.owner.insert(briefItem).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, briefId: b!.id, ord: 1, competitorId: IDS.competitorX, headline: 'Furnace repair headline', whatChanged: 'Smith HVAC furnace repair changed',
      whyItMatters: 'It matters', recommendedAction: 'Respond', confidence: 0.9, effort: 'L', impact: 'H', evidenceIds: [], status: 'active', upsellTag: 'seo_audit',
    }).returning();

    const v = await connect((await mint('viewer', 'read')).token);
    const hits = (json(await call(v, 'search', { query: 'furnace repair' })) as { results: { id: string }[] }).results.map((r) => r.id);
    expect(hits).toContain(`event:${live.eventId}`);
    expect(hits).not.toContain(`event:${retracted.eventId}`);
    expect(hits).not.toContain(`alert:${al!.id}`);
    expect(errorOf(await call(v, 'fetch', { id: `event:${retracted.eventId}` }))).toEqual(NOT_FOUND);
    expect(errorOf(await call(v, 'fetch', { id: `alert:${al!.id}` }))).toEqual(NOT_FOUND);
    const fetched = await call(v, 'fetch', { id: `brief_item:${item!.id}` });
    expect(fetched.isError).toBeUndefined();
    expect(fetched.content[0]!.text).not.toContain('seo_audit');
    expect(fetched.content[0]!.text).not.toMatch(/upsell/i);
    for (const tool of ['list_briefs', 'list_alerts']) expect((await call(v, tool)).content[0]!.text).not.toContain('seo_audit');

    // An agency token does see the pending alert: the filter is role based, not a blanket hide.
    const a = await connect((await mint('admin', 'read')).token);
    expect((await call(a, 'fetch', { id: `alert:${al!.id}` })).isError).toBeUndefined();
  });

  it('a client-bound token only reaches its own client', async () => {
    const other = await seedEvent({ score: 80, route: 'alert', ageDays: 1, summary: 'Bright Smiles whitening promo', competitorId: IDS.competitorY, clientId: IDS.clientA2 });
    const mine = await seedEvent({ score: 80, route: 'alert', ageDays: 1, summary: 'Smith HVAC whitening style promo' });
    const v = await connect((await mint('viewer', 'read')).token);
    expect(errorOf(await call(v, 'search', { query: 'whitening', clientId: IDS.clientA2 }))).toEqual({ code: 'not_found', message: 'Client not found' });
    const own = (json(await call(v, 'search', { query: 'whitening' })) as { results: { id: string }[] }).results.map((r) => r.id);
    expect(own).toEqual([`event:${mine.eventId}`]);
    expect(errorOf(await call(v, 'fetch', { id: `event:${other.eventId}` }))).toEqual(NOT_FOUND);
    expect(errorOf(await call(v, 'get_client_profile', { clientId: IDS.clientA2 })).code).toBe('not_found');
  });

  it('cross-agency: adminB gets not_found for A1 on get_client_profile, list_briefs, search(clientId), fetch brief_item', async () => {
    const [b] = await dbs.owner.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, ...period, deliveryDate: '2026-10-05', status: 'sent', summary: 'Quiet week.' }).returning();
    const [item] = await dbs.owner.insert(briefItem).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, briefId: b!.id, ord: 1, competitorId: IDS.competitorX, headline: 'Furnace repair headline', whatChanged: 'Smith HVAC furnace repair changed',
      whyItMatters: 'It matters', recommendedAction: 'Respond', confidence: 0.9, effort: 'L', impact: 'H', evidenceIds: [], status: 'active',
    }).returning();
    const c = await connect((await mint('adminB', 'read')).token);
    expect(errorOf(await call(c, 'get_client_profile', { clientId: IDS.clientA1 })).code).toBe('not_found');
    expect(errorOf(await call(c, 'list_briefs', { clientId: IDS.clientA1 })).code).toBe('not_found');
    expect(errorOf(await call(c, 'search', { query: 'furnace', clientId: IDS.clientA1 })).code).toBe('not_found');
    expect(errorOf(await call(c, 'fetch', { id: `brief_item:${item!.id}` }))).toEqual(NOT_FOUND);
  });

  it('cross-agency, OAuth-bound: a client-owner grant bound to A1 gets not_found for A2', async () => {
    await dbs.service.insert(oauthGrantBinding).values({ consentId: 'consent-it', oauthClientId: 'oc', agencyId: IDS.agencyA, userId: USERS.owner.id, clientId: IDS.clientA1, scope: 'read' });
    const oauthDeps: McpHandlerDeps = { ...d, verifyOAuth: async (t) => (t === 'opaque-oauth' ? { userId: USERS.owner.id, consentId: 'consent-it' } : null) };
    const c = await connect('opaque-oauth', oauthDeps);
    expect((await call(c, 'get_client_profile', { clientId: IDS.clientA1 })).isError).toBeUndefined();
    expect(errorOf(await call(c, 'get_client_profile', { clientId: IDS.clientA2 })).code).toBe('not_found');
    // An agency admin's grant cannot be bound to a client: there is no matching client membership, so the token is dead (401).
    await dbs.service.insert(oauthGrantBinding).values({ consentId: 'consent-adm', oauthClientId: 'oc', agencyId: IDS.agencyA, userId: USERS.admin.id, clientId: IDS.clientA1, scope: 'read' });
    const admDeps: McpHandlerDeps = { ...d, verifyOAuth: async () => ({ userId: USERS.admin.id, consentId: 'consent-adm' }) };
    expect((await rawPost('opaque-oauth', 'tools/list', admDeps)).status).toBe(401);
    await expect(connect('opaque-oauth', admDeps)).rejects.toThrow();
  });

  it('P18: an account manager scoped to A1 fetches X evidence via A1 and gets not_found for a Y one', async () => {
    const x = await seedCapture({ competitorId: IDS.competitorX });
    const y = await seedCapture({ competitorId: IDS.competitorY });
    const c = await connect((await mint('am', 'read')).token);
    const ok = await call(c, 'fetch', { id: `evidence:${x.ids.screenshot}` });
    expect(ok.isError).toBeUndefined();
    expect(json(ok)).toMatchObject({ id: `evidence:${x.ids.screenshot}` });
    expect(errorOf(await call(c, 'fetch', { id: `evidence:${y.ids.screenshot}` }))).toEqual(NOT_FOUND);
    expect(errorOf(await call(c, 'get_client_profile', { clientId: IDS.clientA2 })).code).toBe('not_found');
  });

  it('review cross-client: an A1 owner sees only X reviews; clientId A2 and fetch of a Y review are not_found', async () => {
    const x = await seedReview({ competitorId: IDS.competitorX, text: 'Smith crew was prompt', rating: 5 });
    const y = await seedReview({ competitorId: IDS.competitorY, text: 'Bright Smiles hygienist was gentle', rating: 4 });
    const c = await connect((await mint('owner', 'read')).token);
    const mine = json(await call(c, 'search_reviews', { clientId: IDS.clientA1, detail: 'full' })) as { items: { reviewId: string }[] };
    expect(mine.items.map((r) => r.reviewId)).toEqual([x]);
    expect(errorOf(await call(c, 'search_reviews', { clientId: IDS.clientA2 })).code).toBe('not_found');
    expect(errorOf(await call(c, 'fetch', { id: `review:${y}` }))).toEqual(NOT_FOUND);
    expect((await call(c, 'fetch', { id: `review:${x}` })).isError).toBeUndefined();
  });

  it('61st call in a minute gives rate_limited', async () => {
    // The handler has no clock injection, so seed the current minute window at the limit (and the next minute, in case it rolls over).
    const { id, token } = await mint('admin', 'read');
    const c = await connect(token);
    const MIN = 60_000;
    const base = Math.floor(Date.now() / MIN) * MIN;
    for (const t of [base, base + MIN]) {
      await dbs.owner.execute(sql`INSERT INTO mcp_rate_window (token_key, window_kind, window_start, count)
        VALUES (${`pat:${id}`}, 'minute', ${new Date(t).toISOString()}::timestamptz, ${RATE_LIMITS.perMinute})`);
    }
    const e = errorOf(await call(c, 'list_clients'));
    expect(e.code).toBe('rate_limited');
    expect(e.retry_after_s).toBeGreaterThanOrEqual(1);
    expect(e.retry_after_s).toBeLessThanOrEqual(60);
    // tools/list is neither counted nor limited.
    expect((await c.listTools()).tools.length).toBeGreaterThan(0);
  });

  it('mcp feature off gives an empty tools/list with 200', async () => {
    const { token } = await mint('viewer', 'read');
    await dbs.owner.update(clientTable).set({ features: ['dashboard'] }).where(eq(clientTable.id, IDS.clientA1));
    const c = await connect(token);
    expect(await names(c)).toEqual([]);
    const [row] = await dbs.service.select({ at: apiToken.lastUsedAt }).from(apiToken);
    expect(row!.at).not.toBeNull();
  });

  it('search/fetch are ChatGPT-shaped', async () => {
    const ev = await seedEvent({ score: 80, route: 'alert', ageDays: 1, summary: 'Smith HVAC cut its furnace repair price' });
    const c = await connect((await mint('admin', 'read')).token);
    const s = json(await call(c, 'search', { query: 'furnace repair', clientId: IDS.clientA1 })) as { results: Record<string, unknown>[] };
    expect(Object.keys(s)).toEqual(['results']);
    expect(Object.keys(s.results[0]!).sort()).toEqual(['id', 'snippet', 'title', 'url']);
    expect(s.results[0]).toMatchObject({ id: `event:${ev.eventId}`, title: 'Smith HVAC: Price change' });
    const f = json(await call(c, 'fetch', { id: `event:${ev.eventId}` }));
    expect(f).toMatchObject({ id: `event:${ev.eventId}`, title: expect.any(String), text: expect.stringContaining('furnace repair'), url: expect.any(String), metadata: { type: 'event' } });
  });
});
