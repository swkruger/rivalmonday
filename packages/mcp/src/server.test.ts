import { randomUUID } from 'node:crypto';
import { type AccessContext, type TokenScope, ToolError, ToolRegistry, toolkit } from '@cs/core';
import { brief, briefItem } from '@cs/db';
import { IDS, pauseAgency } from '@cs/db/test-helpers';
import { createToolRegistry, type ToolDeps } from '@cs/tools';
import { ctx, dbs, resetWorkspace, seedCapture } from '@cs/tools/test-fixtures';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ResolvedToken } from './auth';
import { RATE_LIMITS } from './rate-limit';
import { createMcpServer } from './server';

const MCP_READ_TOOLS = [
  'list_clients', 'get_client_profile', 'list_client_competitors', 'get_competitor_profile', 'get_competitor_timeline', 'search_events', 'get_event',
  'get_evidence', 'compare_snapshots', 'get_price_matrix', 'get_price_history', 'list_ads', 'get_ad_activity', 'get_theme_benchmark', 'search_reviews',
  'get_rating_trend', 'get_geogrid', 'get_share_of_voice', 'list_moves', 'get_move', 'list_briefs', 'get_brief', 'list_recommendations', 'list_alerts', 'get_usage',
  'search', 'fetch', 'search_knowledge', 'get_competitor_signals',
];
const MCP_FEEDBACK_TOOLS = ['submit_feedback', 'update_recommendation_status', 'add_recommendation'];
const MCP_MANAGE_TOOLS = ['set_alert_rules', 'update_client_profile', 'set_page_pin', 'run_prospect_snapshot'];

const store = new Map<string, Uint8Array>();
const deps: ToolDeps = { app: dbs.app, service: dbs.service, evidenceStore: { get: async (k) => store.get(k) ?? null } };
const registry = createToolRegistry(deps, { audit: { record: async () => {} } });

/** A tiny registry whose tools throw each error kind. */
const { defineTool } = toolkit<ToolDeps>();
const SECRET = 'db password is hunter2';
const fakes = new ToolRegistry<ToolDeps>(deps, { record: async () => {} }).register(
  defineTool({
    name: 'echo', access: 'read', description: 'Rival Monday echoes. Ask Rival Monday anything.', input: z.object({ text: z.string() }), output: z.object({ text: z.string() }),
    permission: 'read', channels: ['mcp'], handler: async (_c, i) => ({ text: i.text }),
  }),
  defineTool({
    name: 'missing', access: 'read', description: 'Throws not_found.', input: z.object({}), output: z.object({}), permission: 'read', channels: ['mcp'],
    handler: async () => { throw new ToolError('not_found', 'Brief not found'); },
  }),
  defineTool({
    name: 'denied', access: 'read', description: 'Throws permission_denied.', input: z.object({}), output: z.object({}), permission: 'read', channels: ['mcp'],
    handler: async () => { throw new ToolError('permission_denied', 'You may not see client A2'); },
  }),
  defineTool({
    name: 'boom', access: 'read', description: 'Throws a plain error.', input: z.object({}), output: z.object({}), permission: 'read', channels: ['mcp'],
    // Drizzle-style: the wrapper's message and the driver error's detail carry the query params (user input).
    handler: async () => {
      throw new Error(`Failed query: select 1 where x = $1 params: input-secret ${SECRET}`, {
        cause: Object.assign(new Error(`duplicate key: ${SECRET}`), { code: '23505', detail: 'Key (x)=(input-secret) already exists.' }),
      });
    },
  }),
);

const admin = ctx('agency_admin', 'all');
const viewer = ctx('client_viewer', [IDS.clientA1], ['dashboard', 'mcp']);
const clients: Client[] = [];

async function connect(c: AccessContext, scope: TokenScope, o: { registry?: ToolRegistry<ToolDeps>; productName?: string } = {}) {
  const tokenId = randomUUID();
  const token: ResolvedToken = { kind: 'pat', tokenKey: `pat:${tokenId}`, tokenId, userId: c.userId, agencyId: c.agencyId, clientId: null, scope };
  const server = createMcpServer({ ctx: c, token, registry: o.registry ?? registry, deps, service: dbs.service, branding: { productName: o.productName ?? 'Rival Monday' } });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(st), client.connect(ct)]);
  clients.push(client);
  return { client, token };
}

const names = async (client: Client) => (await client.listTools()).tools.map((t) => t.name).sort();
type TextResult = { isError?: boolean; content: { type: string; text: string }[] };
const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as TextResult;
const errorOf = (r: TextResult) => {
  expect(r.isError).toBe(true);
  return JSON.parse(r.content[0]!.text) as Record<string, unknown>;
};
/** The SDK client prefixes the wire message with "MCP error <code>: " (handler.test checks the wire message itself). */
const NOT_FOUND_READ = { code: -32002, message: 'MCP error -32002: Not found' };
const readError = (p: Promise<unknown>) => p.then(() => null, (e: { code: number; message: string; data?: unknown }) => ({ code: e.code, message: e.message, data: e.data }));

const period = { periodStart: new Date('2026-09-28T00:00:00Z'), periodEnd: new Date('2026-10-04T00:00:00Z') };
async function seedBrief(status: string, deliveryDate = '2026-10-05'): Promise<string> {
  const [b] = await dbs.owner.insert(brief).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, ...period, deliveryDate, status, summary: 'Quiet week overall.' }).returning();
  return b!.id;
}
async function seedItem(briefId: string, ord: number, headline: string, upsellTag: string | null): Promise<void> {
  await dbs.owner.insert(briefItem).values({
    agencyId: IDS.agencyA, clientId: IDS.clientA1, briefId, ord, competitorId: IDS.competitorX, headline, whatChanged: `${headline} changed`,
    whyItMatters: 'It matters', recommendedAction: 'Respond', confidence: 0.9, effort: 'L', impact: 'H', evidenceIds: [], status: 'active', upsellTag,
  });
}

beforeEach(async () => {
  store.clear();
  await resetWorkspace();
});
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
  vi.restoreAllMocks();
});

describe('tools', () => {
  it('read scope lists exactly the d5 read tools', async () => {
    const { client } = await connect(admin, 'read');
    expect(await names(client)).toEqual([...MCP_READ_TOOLS].sort());
  });

  it('feedback adds three', async () => {
    const { client } = await connect(admin, 'feedback');
    expect(await names(client)).toEqual([...MCP_READ_TOOLS, ...MCP_FEEDBACK_TOOLS].sort());
  });

  it('client token never sees manage', async () => {
    const owner = ctx('client_owner', [IDS.clientA1], ['dashboard', 'mcp']);
    const { client } = await connect(owner, 'manage');
    const listed = await names(client);
    for (const t of MCP_MANAGE_TOOLS) expect(listed).not.toContain(t);
    expect(errorOf(await call(client, 'set_alert_rules', {}))).toEqual({ code: 'not_found', message: 'Unknown tool: set_alert_rules' });
    // P4: a client role without the mcp feature sees no tools (and is not refused outright).
    const { client: noMcp } = await connect(ctx('client_owner', [IDS.clientA1], ['dashboard']), 'manage');
    expect(await names(noMcp)).toEqual([]);
  });

  it('descriptions use productName', async () => {
    const { client } = await connect(admin, 'read', { registry: fakes, productName: 'Acme Intel' });
    const echo = (await client.listTools()).tools.find((t) => t.name === 'echo')!;
    expect(echo.description).toBe('Acme Intel echoes. Ask Acme Intel anything.');
    expect(echo.inputSchema).toMatchObject({ type: 'object', properties: { text: { type: 'string' } } });
    expect(await call(client, 'echo', { text: 'hi' })).toEqual({ content: [{ type: 'text', text: '{"text":"hi"}' }] });
  });

  it('error JSON for not_found/invalid_input/internal', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = await connect(admin, 'read', { registry: fakes });
    expect(errorOf(await call(client, 'missing'))).toEqual({ code: 'not_found', message: 'Brief not found' });
    const bad = errorOf(await call(client, 'echo', { text: 7 }));
    expect(bad.code).toBe('invalid_input');
    expect(bad.message).toMatch(/text/);
    expect(errorOf(await call(client, 'boom'))).toEqual({ code: 'internal', message: 'Something went wrong. Try again later.' });
    expect(errorOf(await call(client, 'nope'))).toEqual({ code: 'not_found', message: 'Unknown tool: nope' });
  });

  it('permission_denied → not_found', async () => {
    const { client } = await connect(admin, 'read', { registry: fakes });
    expect(errorOf(await call(client, 'denied'))).toEqual({ code: 'not_found', message: 'Not found' });
  });

  it('internal hides the error and logs only its name, ToolError code and postgres code (no message, params or cause)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = await connect(admin, 'read', { registry: fakes });
    const r = await call(client, 'boom', { password: 'input-secret' });
    expect(JSON.stringify(r)).not.toContain('hunter2');
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toBe('[mcp] tool boom failed');
    expect(log.mock.calls[0]![1]).toEqual({ error: 'Error', code: 'internal', pgCode: '23505' });
    const logged = JSON.stringify(log.mock.calls, (_k, v: unknown) => (v instanceof Error ? { message: v.message, cause: v.cause } : v));
    expect(logged).not.toContain('input-secret');
    expect(logged).not.toContain('hunter2');
  });

  it('rate_limited has retry_after_s', async () => {
    const { client, token } = await connect(admin, 'read', { registry: fakes });
    const dayStart = new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000);
    await dbs.owner.execute(sql`INSERT INTO mcp_rate_window (token_key, window_kind, window_start, count)
      VALUES (${token.tokenKey}, 'day', ${dayStart.toISOString()}::timestamptz, ${RATE_LIMITS.perDay})`);
    const e = errorOf(await call(client, 'echo', { text: 'hi' }));
    expect(e.code).toBe('rate_limited');
    expect(typeof e.retry_after_s).toBe('number');
    expect(e.retry_after_s as number).toBeGreaterThanOrEqual(1);
    expect(e.message).toBe(`Too many requests. Try again in ${e.retry_after_s} seconds.`);
    // P17: resources/read counts (and is refused) too.
    const r = await readError(client.readResource({ uri: `brief://${randomUUID()}` }));
    expect(r).toMatchObject({ code: -32002, data: { retry_after_s: expect.any(Number) } });
    expect(r!.message).toBe(`MCP error -32002: Too many requests. Try again in ${(r!.data as { retry_after_s: number }).retry_after_s} seconds.`);
    // tools/list does not count.
    await client.listTools();
    const [row] = [...(await dbs.owner.execute<{ count: number }>(sql`SELECT count FROM mcp_rate_window WHERE token_key = ${token.tokenKey} AND window_kind = 'day'`))];
    expect(row!.count).toBe(RATE_LIMITS.perDay + 2);
  });
});

describe('resources', () => {
  it('evidence:// redacted text + image', async () => {
    const cap = await seedCapture({ kinds: ['text', 'screenshot'] });
    store.set(cap.objectKeys.text!, new TextEncoder().encode('Call our office at bob.jones@example.com for a quote.'));
    const png = new Uint8Array([1, 2, 3, 4, 5]);
    store.set(cap.objectKeys.screenshot!, png);
    const { client } = await connect(viewer, 'read');

    const text = await client.readResource({ uri: `evidence://${cap.ids.text}` });
    expect(text.contents).toHaveLength(1);
    const t0 = text.contents[0] as { uri: string; text: string; mimeType?: string };
    expect(t0).toMatchObject({ uri: `evidence://${cap.ids.text}`, mimeType: 'text/plain' });
    expect(t0.text).toContain('for a quote');
    expect(t0.text).not.toContain('bob.jones@example.com');

    const shot = await client.readResource({ uri: `evidence://${cap.ids.screenshot}` });
    expect(shot.contents).toHaveLength(2);
    expect((shot.contents[0] as { text: string }).text).toMatch(/^Screenshot of /);
    expect(shot.contents[1]).toEqual({ uri: `evidence://${cap.ids.screenshot}`, mimeType: 'image/webp', blob: Buffer.from(png).toString('base64') });

    // Screenshot bytes gone from the store: text only.
    store.delete(cap.objectKeys.screenshot!);
    expect((await client.readResource({ uri: `evidence://${cap.ids.screenshot}` })).contents).toHaveLength(1);

    expect(await readError(client.readResource({ uri: `evidence://${randomUUID()}` }))).toMatchObject(NOT_FOUND_READ);
    expect(await readError(client.readResource({ uri: 'evidence://junk' }))).toMatchObject(NOT_FOUND_READ);
    // Registry gate: a client role without the mcp feature sees no get_evidence, so no resource either.
    const { client: noMcp } = await connect(ctx('client_viewer', [IDS.clientA1], ['dashboard']), 'read');
    expect(await readError(noMcp.readResource({ uri: `evidence://${cap.ids.text}` }))).toMatchObject(NOT_FOUND_READ);
  });

  it('brief:// ord-sorted, no upsell for client roles', async () => {
    const id = await seedBrief('sent');
    await seedItem(id, 5, 'Second headline', 'ppc');
    await seedItem(id, 2, 'First headline', 'seo_audit');
    await seedItem(id, 3, 'Middle headline', null);

    const { client } = await connect(viewer, 'read');
    const r = await client.readResource({ uri: `brief://${id}` });
    const c = r.contents[0] as { uri: string; text: string; mimeType?: string };
    expect(c).toMatchObject({ uri: `brief://${id}`, mimeType: 'text/markdown' });
    expect(c.text).toMatch(/^# Weekly brief 2026-10-05/);
    expect(c.text).toContain('Quiet week overall.');
    expect(c.text.indexOf('First headline')).toBeLessThan(c.text.indexOf('Middle headline'));
    expect(c.text.indexOf('Middle headline')).toBeLessThan(c.text.indexOf('Second headline'));
    expect(c.text).not.toContain('Upsell');
    expect(c.text).not.toContain('seo_audit');
    expect(c.text).not.toContain('ppc');

    const { client: agencyClient } = await connect(admin, 'read');
    const a = (await agencyClient.readResource({ uri: `brief://${id}` })).contents[0] as { text: string };
    const first = a.text.indexOf('First headline'), middle = a.text.indexOf('Middle headline'), second = a.text.indexOf('Second headline');
    const seo = a.text.indexOf('Upsell: seo_audit'), ppc = a.text.indexOf('Upsell: ppc');
    expect(first).toBeLessThan(seo);
    expect(seo).toBeLessThan(middle);
    expect(middle).toBeLessThan(second);
    expect(second).toBeLessThan(ppc);
    expect(a.text.match(/Upsell:/g)).toHaveLength(2);

    // A ready brief is hidden from client roles.
    const ready = await seedBrief('ready', '2026-10-12');
    expect(await readError(client.readResource({ uri: `brief://${ready}` }))).toMatchObject(NOT_FOUND_READ);
  });
});

describe('prompts', () => {
  it('4 prompts with arguments', async () => {
    const { client } = await connect(admin, 'read');
    const { prompts } = await client.listPrompts();
    const byName = Object.fromEntries(prompts.map((p) => [p.name, (p.arguments ?? []).map((a) => ({ name: a.name, required: a.required ?? false }))]));
    expect(byName).toEqual({
      weekly_review: [{ name: 'client_id', required: false }],
      competitor_deep_dive: [{ name: 'competitor_id', required: true }],
      respond_to_price_change: [{ name: 'event_id', required: true }],
      prepare_client_meeting: [{ name: 'client_id', required: false }],
    });

    const text = async (name: string, args: Record<string, string> = {}) => {
      const r = await client.getPrompt({ name, arguments: args });
      expect(r.messages).toHaveLength(1);
      expect(r.messages[0]!.role).toBe('user');
      return (r.messages[0]!.content as { type: string; text: string }).text;
    };
    const C = IDS.competitorX;
    expect(await text('competitor_deep_dive', { competitor_id: C })).toBe(
      `Give me a deep dive on competitor ${C}. Use \`get_competitor_profile\` and \`get_competitor_timeline\`, then \`get_price_history\`, \`list_ads\` and \`search_reviews\` for that competitor. Cover pricing, advertising, reputation and recent moves, cite evidence ids for every claim, and end with two or three ways we could respond.`,
    );
    const E = randomUUID();
    expect(await text('respond_to_price_change', { event_id: E })).toBe(
      `A competitor changed a price (event ${E}). Use \`get_event\` and \`compare_snapshots\` to confirm exactly what changed, \`get_price_matrix\` to compare with our prices, and \`list_recommendations\` to avoid duplicates. Suggest a response — matching is rarely best; consider bundles, guarantees or service speed — and cite the evidence ids.`,
    );
    expect(await text('prepare_client_meeting')).toBe(
      'Help me prepare for a meeting with this client. Use `get_client_profile`, `list_briefs`/`get_brief` for the last four weeks, `list_alerts`, `list_moves` and `list_recommendations`. Produce a one-page agenda: wins, threats with evidence ids, open recommendations and their status, and questions to ask.',
    );
    expect(await text('prepare_client_meeting', { client_id: IDS.clientA1 })).toContain(`a meeting with client ${IDS.clientA1}. Use`);
    expect(await text('weekly_review')).toBe(
      "Review this week's competitor activity for this client. Use `list_briefs` and `get_brief` for the latest brief, `search_events` (route flagged, days 7) for anything newer, and `list_recommendations` for open actions. Summarise the three most important changes with their evidence ids, then list what to do next. Say plainly when there is no evidence for a point.",
    );
    expect(await text('weekly_review', { client_id: IDS.clientA1 })).toContain(`activity for client ${IDS.clientA1}. Use`);

    // zod validation of arguments.
    await expect(client.getPrompt({ name: 'competitor_deep_dive', arguments: { competitor_id: 'not-a-uuid' } })).rejects.toThrow();
    await expect(client.getPrompt({ name: 'respond_to_price_change', arguments: {} })).rejects.toThrow();
  });
});

describe('billing state (9a)', () => {
  it('tools/call is refused with service_paused (role-aware copy) for a read_only agency; tools/list still works and a serviceable agency is unaffected', async () => {
    const { client: ok } = await connect(admin, 'read', { registry: fakes });
    expect(await call(ok, 'echo', { text: 'hi' })).toEqual({ content: [{ type: 'text', text: '{"text":"hi"}' }] });
    await pauseAgency(dbs.owner, IDS.agencyA);
    const { client: paused } = await connect(admin, 'read', { registry: fakes });
    expect(await names(paused)).toContain('echo');
    expect(errorOf(await call(paused, 'echo', { text: 'hi' }))).toEqual({ code: 'service_paused', message: 'Service is paused. Update your payment method to resume.' });
    const { client: staff } = await connect(ctx('account_manager', 'all'), 'read', { registry: fakes });
    expect(errorOf(await call(staff, 'echo', { text: 'hi' }))).toEqual({ code: 'service_paused', message: "Your agency's account needs attention." });
    const { client: cl } = await connect(viewer, 'read', { registry: fakes });
    expect(errorOf(await call(cl, 'echo', { text: 'hi' }))).toEqual({ code: 'service_paused', message: 'This workspace is temporarily unavailable.' });
  });

  it('evidence:// and brief:// are refused with service_paused (role-aware copy) for a paused agency (I7)', async () => {
    const cap = await seedCapture({ kinds: ['text'] });
    store.set(cap.objectKeys.text!, new TextEncoder().encode('Some page text.'));
    const id = await seedBrief('sent');
    await pauseAgency(dbs.owner, IDS.agencyA);
    const { client: a } = await connect(admin, 'read');
    const PAUSED = { code: -32002, message: 'MCP error -32002: Service is paused. Update your payment method to resume.' };
    expect(await readError(a.readResource({ uri: `evidence://${cap.ids.text}` }))).toMatchObject(PAUSED);
    expect(await readError(a.readResource({ uri: `brief://${id}` }))).toMatchObject(PAUSED);
    const { client: cl } = await connect(viewer, 'read');
    const UNAVAILABLE = { code: -32002, message: 'MCP error -32002: This workspace is temporarily unavailable.' };
    expect(await readError(cl.readResource({ uri: `evidence://${cap.ids.text}` }))).toMatchObject(UNAVAILABLE);
    expect(await readError(cl.readResource({ uri: `brief://${id}` }))).toMatchObject(UNAVAILABLE);
  });
});
