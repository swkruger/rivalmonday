import { brandLeaks, createAccessContext, type AccessContext, type Feature } from '@cs/core';
import { agency, alert, brief, briefItem, client as clientTable, createAuditSink, membership } from '@cs/db';
import { IDS } from '@cs/db/test-helpers';
import { createToolRegistry, type ToolDeps } from '@cs/tools';
import { dbs, resetWorkspace, seedEvent } from '@cs/tools/test-fixtures';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleMcpRequest, type McpHandlerDeps } from './handler';

/** 13a2 Task 11: an agency with no display name and no branding ("Cool Agency") serves MCP that never names the platform. */
const deps: ToolDeps = { app: dbs.app, service: dbs.service };
const registry = createToolRegistry(deps, { audit: createAuditSink(dbs.service) });
const d: McpHandlerDeps = { service: dbs.service, registry, deps, appUrl: 'https://rivalmonday.app', verifyOAuth: null };
const MCP_URL = new URL('https://mcp.example-neutral.test/mcp');

const viewerCtx = (): AccessContext => createAccessContext({ agencyId: IDS.agencyA, userId: 'u-viewer', role: 'client_viewer', clientScope: [IDS.clientA1], features: ['mcp'] as Feature[] });
const adminCtx = (): AccessContext => createAccessContext({ agencyId: IDS.agencyA, userId: 'u-admin', role: 'agency_admin', clientScope: 'all', features: ['mcp'] as Feature[] });

const open: Client[] = [];
type TextResult = { isError?: boolean; content: { type: string; text: string }[] };
async function connectAs(ctx: AccessContext): Promise<Client> {
  const { token } = (await registry.invoke(ctx, 'create_api_token', { name: 'leak', scope: 'read' })) as { token: string };
  const fetchIn = (url: string | URL, init?: RequestInit) => handleMcpRequest(new Request(url, init), d);
  const transport = new StreamableHTTPClientTransport(MCP_URL, { fetch: fetchIn as typeof fetch, requestInit: { headers: { authorization: `Bearer ${token}` } } });
  const c = new Client({ name: 'leak', version: '1.0.0' });
  await c.connect(transport);
  open.push(c);
  return c;
}
const call = async (c: Client, name: string, args: Record<string, unknown> = {}) => (await c.callTool({ name, arguments: args })) as TextResult;

beforeEach(async () => {
  await resetWorkspace();
  await dbs.service.update(agency).set({ name: 'Cool Agency', branding: null }).where(eq(agency.id, IDS.agencyA));
  await dbs.owner.execute(sql`truncate auth."user", auth.verification, auth."rateLimit" cascade`);
  for (const [id, role, clientId] of [['u-admin', 'agency_admin', null], ['u-viewer', 'client_viewer', IDS.clientA1]] as const) {
    await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values (${id}, ${id}, ${`${id}@e.co`}, true)`);
    await dbs.service.insert(membership).values({ userId: id, agencyId: IDS.agencyA, role, clientId, clientScope: null, createdBy: 't' });
  }
  await dbs.owner.update(clientTable).set({ features: ['dashboard', 'mcp'] }).where(eq(clientTable.id, IDS.clientA1));
});
afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.close()));
});

describe('MCP leak sweep', () => {
  it('serverInfo, instructions and every tool description are clean for an agency without a display name', async () => {
    const c = await connectAs(adminCtx());
    expect(brandLeaks(JSON.stringify(c.getServerVersion())), 'serverInfo').toEqual([]);
    expect(c.getServerVersion()?.name).toBe('Cool Agency');
    expect(brandLeaks(c.getInstructions() ?? ''), 'instructions').toEqual([]);
    const { tools } = await c.listTools();
    expect(tools.length).toBeGreaterThan(10);
    for (const t of tools) expect(brandLeaks(`${t.name} ${t.description ?? ''}`), t.name).toEqual([]);
    const { prompts } = await c.listPrompts();
    for (const p of prompts) expect(brandLeaks(`${p.name} ${p.description ?? ''}`), p.name).toEqual([]);
  });

  it('list_briefs, get_brief, fetch and list_alerts outputs for a client role are clean', async () => {
    const live = await seedEvent({ score: 80, route: 'alert', ageDays: 1, summary: 'Smith HVAC cut its furnace repair price' });
    await dbs.owner.insert(alert).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX, eventId: live.eventId, score: 82, headline: 'Furnace repair alert', body: 'Smith HVAC moved.',
      status: 'delivered', mode: 'after_am_check', evidenceIds: [],
    });
    const [b] = await dbs.owner.insert(brief).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, periodStart: new Date('2026-09-28T00:00:00Z'), periodEnd: new Date('2026-10-04T00:00:00Z'), deliveryDate: '2026-10-05', status: 'sent', summary: 'Quiet week.',
    }).returning();
    const [item] = await dbs.owner.insert(briefItem).values({
      agencyId: IDS.agencyA, clientId: IDS.clientA1, briefId: b!.id, ord: 1, competitorId: IDS.competitorX, headline: 'Furnace repair headline', whatChanged: 'Smith HVAC furnace repair changed',
      whyItMatters: 'It matters', recommendedAction: 'Respond', confidence: 0.9, effort: 'L', impact: 'H', evidenceIds: [], status: 'active',
    }).returning();
    const c = await connectAs(viewerCtx());
    const outs: [string, TextResult][] = [
      ['list_briefs', await call(c, 'list_briefs', { clientId: IDS.clientA1 })],
      ['get_brief', await call(c, 'get_brief', { clientId: IDS.clientA1, briefId: b!.id })],
      ['fetch brief_item', await call(c, 'fetch', { id: `brief_item:${item!.id}` })],
      ['fetch event', await call(c, 'fetch', { id: `event:${live.eventId}` })],
      ['list_alerts', await call(c, 'list_alerts', { clientId: IDS.clientA1 })],
    ];
    const seeded: Record<string, string> = {
      list_briefs: 'Weekly brief 2026-10-05', get_brief: 'Furnace repair headline', 'fetch brief_item': 'Furnace repair headline', 'fetch event': 'Smith HVAC', list_alerts: 'Furnace repair alert',
    };
    for (const [name, r] of outs) {
      expect(r.isError, `${name}: ${r.content[0]?.text}`).toBeUndefined();
      const text = r.content.map((x) => x.text).join('\n');
      expect(text, `${name} carries the seeded content`).toContain(seeded[name]!);
      expect(brandLeaks(text), name).toEqual([]);
      // Tool URLs are origin-relative (resolved on the host the client called, the agency host), never an absolute platform link.
      const urls = [...text.matchAll(/"url":"([^"]*)"/g)].map((m) => m[1]!);
      if (name !== 'get_brief') expect(urls.length, `${name} returns a url`).toBeGreaterThan(0);
      for (const u of urls) expect(u, `${name}: ${u}`).toMatch(/^\/(?!\/)/);
      expect(text, name).not.toMatch(/https?:\/\/[^\s"]*rivalmonday/i);
    }
  });
});
