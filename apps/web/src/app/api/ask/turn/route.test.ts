import { ASK_COPY, type AskDeps, type AskEvent } from '@cs/ask';
import { createScriptedAskAi, type ScriptedStep } from '@cs/ask/testing';
import { type AccessContext, type AuditSink, createAccessContext, ToolRegistry, toolkit } from '@cs/core';
import { agency, askMessage, client } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import type { ToolDeps } from '@cs/tools';
import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const EV1 = '11111111-1111-4111-8111-111111111111';
const m = vi.hoisted(() => ({
  viewer: null as unknown,
  script: [] as unknown[],
  audit: undefined as unknown,
  kept: [] as Promise<unknown>[],
  depsFail: false,
  hints: [] as (string | null)[],
}));

vi.mock('@/server/current-viewer', () => ({
  getViewer: async () => m.viewer,
  getViewerForClient: async (hint: string | null) => {
    m.hints.push(hint);
    return m.viewer;
  },
}));
vi.mock('next/server', async (orig) => ({ ...(await orig<object>()), after: (task: () => Promise<unknown>) => void m.kept.push(task()) }));

const { defineTool } = toolkit<ToolDeps>();
const registry = new ToolRegistry<ToolDeps>({} as ToolDeps, { record: async () => {} }).register(
  defineTool({
    name: 'search_events', description: 'Search changes', input: z.object({ clientId: z.string() }), output: z.any(), permission: 'read', channels: ['ask'],
    handler: async () => ({ items: [{ id: 'e1', title: 'Acme cut AC tune-up to $69', evidenceIds: [EV1] }] }) as never,
  }),
);

vi.mock('@/server/ask', async (orig) => ({
  ...(await orig<object>()),
  askDeps: async (): Promise<AskDeps> => {
    if (m.depsFail) throw new Error('OPENROUTER_API_KEY is required');
    return {
    app: dbs.app, service: dbs.service, ai: createScriptedAskAi(m.script as ScriptedStep[]), registry, toolDeps: {} as ToolDeps,
    ...(m.audit ? { audit: m.audit as AuditSink } : {}),
    };
  },
}));

const { POST } = await import('./route');
const { E2E_SCRIPT } = await import('@/server/ask');

const ctxFor = (o: Partial<Parameters<typeof createAccessContext>[0]> = {}): AccessContext =>
  createAccessContext({ agencyId: IDS.agencyA, userId: 'u1', role: 'client_owner', clientScope: [IDS.clientA1], features: ['ask', 'dashboard'], ...o });
const userViewer = (ctx: AccessContext) => ({ kind: 'user', userId: ctx.userId, email: 'u1@e.co', name: 'U1', ctx });

const post = (body: unknown, signal?: AbortSignal) =>
  POST(new Request('http://localhost/api/ask/turn', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal }));

async function events(res: Response): Promise<AskEvent[]> {
  const text = await res.text();
  return text.split('\n\n').filter(Boolean).map((frame) => {
    expect(frame.startsWith('data: ')).toBe(true);
    return JSON.parse(frame.slice(6)) as AskEvent;
  });
}

const ANSWER: ScriptedStep[] = [
  { kind: 'chat', reply: { toolCalls: [{ name: 'search_events', args: { clientId: IDS.clientA1 } }] } },
  { kind: 'chat', reply: { text: `Acme cut its AC tune-up to $69 [ev:${EV1}].` } },
  { kind: 'support', verdict: true, repeat: true },
];

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await dbs.owner.execute(sql`truncate auth."user" cascade`);
  await seedTenancy(dbs.owner);
  await dbs.owner.execute(sql`insert into auth."user" (id, name, email, "emailVerified") values ('u1', 'U1', 'u1@e.co', true)`);
  Object.assign(m, { viewer: userViewer(ctxFor()), script: ANSWER, audit: undefined, kept: [], depsFail: false, hints: [] });
});

describe('POST /api/ask/turn', () => {
  it("resolves the viewer under the body's clientId (a multi-client user asks in the workspace it is on)", async () => {
    await (await post({ clientId: IDS.clientA1, question: 'What changed?' })).text();
    await (await POST(new Request('http://localhost/api/ask/turn', { method: 'POST', body: 'not json' }))).text();
    expect(m.hints).toEqual([IDS.clientA1, null]);
  });

  it('404 for guest / no ask feature / foreign client', async () => {
    const q = { clientId: IDS.clientA1, question: 'What changed?' };
    const cases: [unknown, unknown][] = [
      [null, q],
      [{ kind: 'guest', contactId: 'c1', ctx: ctxFor({ userId: 'contact:c1', role: 'client_viewer' }) }, q],
      [{ kind: 'member-less', userId: 'u1', email: 'u1@e.co', name: 'U1' }, q],
      [userViewer(ctxFor({ features: ['dashboard'] })), q],
      [userViewer(ctxFor()), { clientId: IDS.clientA2, question: 'What changed?' }],
      [userViewer(ctxFor({ role: 'agency_admin', clientScope: 'all', features: [] })), { clientId: IDS.clientB1, question: 'What changed?' }],
    ];
    for (const [viewer, body] of cases) {
      m.viewer = viewer;
      const res = await post(body);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe('');
    }
    expect(await dbs.owner.select().from(askMessage)).toHaveLength(0);
  });

  it('400 for a malformed body', async () => {
    expect((await post({ clientId: 'nope', question: 'x' })).status).toBe(400);
    expect((await post({ clientId: IDS.clientA1, question: '' })).status).toBe(400);
    expect((await post({ clientId: IDS.clientA1, question: 'x'.repeat(2001) })).status).toBe(400);
  });

  it('quota → single final with exact copy', async () => {
    await dbs.owner.update(client).set({ askMonthlyQuota: 0 }).where(eq(client.id, IDS.clientA1));
    const res = await post({ clientId: IDS.clientA1, question: 'What changed?' });
    expect(res.status).toBe(200);
    const evs = await events(res);
    const [row] = await dbs.owner.select().from(askMessage).where(eq(askMessage.status, 'quota'));
    expect(res.headers.get('x-ask-thread-id')).toBe(row!.threadId);
    expect(evs).toEqual([{ type: 'final', messageId: row!.id, content: ASK_COPY.quota, citations: [], action: null, status: 'quota' }]);
    expect(ASK_COPY.quota).toBe("You have reached this month's quota.");
  });

  it('events in order progress… final', async () => {
    const res = await post({ clientId: IDS.clientA1, question: 'What changed at Acme?' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    const evs = await events(res);
    const rows = await dbs.owner.select().from(askMessage).orderBy(asc(askMessage.createdAt));
    const last = rows.at(-1)!;
    expect(evs).toEqual([
      { type: 'progress', label: 'Searching competitor changes…' },
      { type: 'final', messageId: last.id, content: `Acme cut its AC tune-up to $69 [ev:${EV1}].`, citations: [`ev:${EV1}`], action: null, status: 'ok' },
    ]);
    expect(rows.map((r) => r.role)).toEqual(['user', 'assistant']);
    expect(res.headers.get('x-ask-thread-id')).toBe(last.threadId);
    // A follow-up in the same thread reports the same id.
    m.script = ANSWER;
    const again = await post({ clientId: IDS.clientA1, threadId: last.threadId, question: 'And Bolt?' });
    expect(again.headers.get('x-ask-thread-id')).toBe(last.threadId);
    await again.text();
  });

  it('the ASK_FAKE_AI script answers through runTurn citing the first evidence id', async () => {
    m.script = E2E_SCRIPT;
    for (const question of ['What changed at Acme?', 'And this week?']) {
      const evs = await events(await post({ clientId: IDS.clientA1, question }));
      expect(evs.map((e) => e.type)).toEqual(['progress', 'final']);
      expect(evs[1]).toMatchObject({ status: 'ok', content: `Acme cut AC tune-up to $69 [ev:${EV1}].`, citations: [`ev:${EV1}`] });
    }
  });

  it('unexpected error → error final', async () => {
    await dbs.owner.update(agency).set({ branding: { assistantName: 'Max' } }).where(eq(agency.id, IDS.agencyA));
    m.audit = { record: async () => { throw new Error('audit down'); } };
    const evs = await events(await post({ clientId: IDS.clientA1, question: 'What changed?' }));
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ type: 'final', status: 'error', content: ASK_COPY.error('Max'), citations: [], action: null });
  });

  it('a failure before the turn starts → error final with the default name', async () => {
    m.depsFail = true;
    const res = await post({ clientId: IDS.clientA1, question: 'What changed?' });
    expect(res.headers.get('x-ask-thread-id')).toBeNull();
    const evs = await events(res);
    expect(evs).toEqual([{ type: 'final', messageId: '', content: ASK_COPY.error('Friday'), citations: [], action: null, status: 'error' }]);
  });

  it('the turn completes after the client disconnects', async () => {
    const ac = new AbortController();
    const res = await post({ clientId: IDS.clientA1, question: 'What changed at Acme?' }, ac.signal);
    ac.abort();
    await res.body!.cancel();
    expect(m.kept).toHaveLength(1);
    await m.kept[0];
    const rows = await dbs.owner.select().from(askMessage).orderBy(asc(askMessage.createdAt));
    expect(rows.map((r) => [r.role, r.status])).toEqual([['user', 'ok'], ['assistant', 'ok']]);
  });
});
