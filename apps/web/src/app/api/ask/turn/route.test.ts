import { ASK_COPY, type AskDeps, type AskEvent } from '@cs/ask';
import { createScriptedAskAi, type ScriptedStep } from '@cs/ask/testing';
import { type AccessContext, AiPausedError, type AiGuard, type AuditSink, createAccessContext, SYSTEM_BUSY_COPY, ToolRegistry, toolkit } from '@cs/core';
import { hashInput } from '@cs/core/server';
import { agency, askMessage, client } from '@cs/db';
import { IDS, openTestDbs, pauseAgency, seedTenancy, truncateAll } from '@cs/db/test-helpers';
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
  guard: undefined as unknown,
  hints: [] as (string | null)[],
  /** When set, the viewer per client hint (else `viewer` for every hint). */
  viewerFor: null as ((hint: string | null) => unknown) | null,
}));

vi.mock('@/server/current-viewer', () => ({
  getViewer: async () => m.viewer,
  getViewerForClient: async (hint: string | null) => {
    m.hints.push(hint);
    return m.viewerFor ? m.viewerFor(hint) : m.viewer;
  },
}));
vi.mock('next/server', async (orig) => ({ ...(await orig<object>()), after: (task: () => Promise<unknown>) => void m.kept.push(task()) }));

const { defineTool } = toolkit<ToolDeps>();
const registry = new ToolRegistry<ToolDeps>({} as ToolDeps, { record: async () => {} }, Date.now, { hashInput }).register(
  defineTool({
    name: 'search_events', access: 'read', description: 'Search changes', input: z.object({ clientId: z.string() }), output: z.any(), permission: 'read', channels: ['ask'],
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
    ...(m.guard ? { guard: m.guard as AiGuard } : {}),
    };
  },
}));

const { POST } = await import('./route');
const { ASK_MAX_BODY_BYTES, E2E_SCRIPT, readCappedJson } = await import('@/server/ask');

const ctxFor = (o: Partial<Parameters<typeof createAccessContext>[0]> = {}): AccessContext =>
  createAccessContext({ agencyId: IDS.agencyA, userId: 'u1', role: 'client_owner', clientScope: [IDS.clientA1], features: ['ask', 'dashboard'], ...o });
const userViewer = (ctx: AccessContext) => ({ kind: 'user', userId: ctx.userId, email: 'u1@e.co', name: 'U1', ctx });

/** Same-origin headers a browser `fetch` sends; `''` drops a header. */
function request(init: { body?: BodyInit | null; headers?: Record<string, string>; signal?: AbortSignal } = {}): Request {
  const headers: Record<string, string> = { host: 'localhost:3100', origin: 'http://localhost:3100', 'content-type': 'application/json', ...init.headers };
  for (const [k, v] of Object.entries(headers)) if (v === '') delete headers[k];
  const body = init.body === undefined ? JSON.stringify({ clientId: IDS.clientA1, question: 'What changed?' }) : init.body;
  return new Request('http://localhost:3100/api/ask/turn', { method: 'POST', headers, body, signal: init.signal, ...(body instanceof ReadableStream ? { duplex: 'half' } : {}) } as RequestInit);
}
const post = (body: unknown, signal?: AbortSignal) => POST(request({ body: JSON.stringify(body), ...(signal ? { signal } : {}) }));

/** A body that never ends unless cancelled: proves the reader stops past the cap. */
function endless(chunk = 1024) {
  const cancel = vi.fn();
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      pulled += chunk;
      c.enqueue(new Uint8Array(chunk).fill(0x20));
    },
    cancel,
  });
  return { stream, cancel, pulled: () => pulled };
}

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
  Object.assign(m, { viewer: userViewer(ctxFor()), script: ANSWER, audit: undefined, kept: [], depsFail: false, hints: [], viewerFor: null, guard: undefined });
});

describe('POST /api/ask/turn', () => {
  it("resolves the viewer with no hint first, then under the body's clientId (a multi-client user asks in the workspace it is on)", async () => {
    await (await post({ clientId: IDS.clientA1, question: 'What changed?' })).text();
    expect(m.hints).toEqual([null, IDS.clientA1]);
    m.hints = [];
    await (await POST(request({ body: 'not json' }))).text();
    expect(m.hints).toEqual([null]);
  });

  it("client hint picks the membership covering the body's client", async () => {
    // The null-hint membership covers another client only (a second single-client membership); the hinted one covers A1.
    const early = userViewer(ctxFor({ clientScope: [IDS.clientA2] }));
    const hinted = userViewer(ctxFor());
    m.viewerFor = (hint) => (hint === IDS.clientA1 ? hinted : early);
    const res = await post({ clientId: IDS.clientA1, question: 'What changed at Acme?' });
    expect(res.status).toBe(200);
    expect((await events(res)).at(-1)).toMatchObject({ type: 'final', status: 'ok' });
    expect(m.hints).toEqual([null, IDS.clientA1]);
  });

  it('signed-out → 404 even with a malformed body', async () => {
    m.viewer = null;
    const req = request({ body: '{not json', headers: { origin: '', 'content-type': 'text/plain' } });
    expect((await POST(req)).status).toBe(404);
    expect(req.bodyUsed).toBe(false);
  });

  it('a refused user with invalid JSON → 404, never 400 (contact, guest, member-less, support)', async () => {
    const ctx = ctxFor({ userId: 'contact:c1', role: 'client_viewer' });
    const viewers = [
      userViewer(ctx),
      { kind: 'guest', contactId: 'c1', ctx },
      { kind: 'member-less', userId: 'u1', email: 'u1@e.co', name: 'U1' },
      { kind: 'support', userId: 'u1', email: 'u1@e.co', name: 'U1', ctx: ctxFor() },
    ];
    for (const viewer of viewers) {
      m.viewer = viewer;
      const req = request({ body: '{not json' });
      expect((await POST(req)).status, viewer.kind).toBe(404);
      expect(req.bodyUsed).toBe(false);
    }
  });

  it('plan without ask → 404 before body read', async () => {
    for (const ctx of [ctxFor({ planFeatures: ['mcp'] }), ctxFor({ role: 'agency_admin', clientScope: 'all', features: [], planFeatures: [] })]) {
      m.viewer = userViewer(ctx);
      const req = request({ body: '{not json' });
      expect((await POST(req)).status).toBe(404);
      expect(req.bodyUsed).toBe(false);
    }
    expect(await dbs.owner.select().from(askMessage)).toHaveLength(0);
  });

  it('a hinted viewer whose plan lost ask → 404 after parsing', async () => {
    m.viewerFor = (hint) => userViewer(ctxFor(hint ? { planFeatures: ['mcp'] } : {}));
    expect((await post({ clientId: IDS.clientA1, question: 'What changed?' })).status).toBe(404);
    expect(await dbs.owner.select().from(askMessage)).toHaveLength(0);
  });

  it("multi-agency user whose other agency's plan lacks ask gets not_found for that agency's client", async () => {
    // Agency A (plan with Ask) is the null-hint membership; the body's client belongs to agency B, whose plan has no Ask.
    const early = userViewer(ctxFor());
    const hinted = userViewer(ctxFor({ agencyId: IDS.agencyB, clientScope: [IDS.clientB1], planFeatures: ['mcp'] }));
    m.viewerFor = (hint) => (hint === IDS.clientB1 ? hinted : early);
    const res = await post({ clientId: IDS.clientB1, question: 'What changed?' });
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
    expect(m.hints).toEqual([null, IDS.clientB1]);
    expect(await dbs.owner.select().from(askMessage)).toHaveLength(0);
    // Control: the same user asking about agency A's client still gets an answer.
    const ok = await post({ clientId: IDS.clientA1, question: 'What changed?' });
    expect(ok.status).toBe(200);
    await ok.text();
  });

  it('missing Origin → 404', async () => {
    const req = request({ headers: { origin: '' } });
    expect((await POST(req)).status).toBe(404);
    expect(req.bodyUsed).toBe(false);
  });

  it('foreign Origin → 404 (other host, look-alike host, other port, opaque, junk); missing Host → 404', async () => {
    for (const origin of ['https://evil.test', 'http://localhost:3100.evil.test', 'http://localhost:3101', 'http://localhost', 'null', 'not a url']) {
      const req = request({ headers: { origin } });
      expect((await POST(req)).status, origin).toBe(404);
      expect(req.bodyUsed).toBe(false);
    }
    expect((await POST(request({ headers: { host: '' } }))).status).toBe(404);
    expect(await dbs.owner.select().from(askMessage)).toHaveLength(0);
  });

  it('Origin host matches Host case-insensitively (scheme not compared)', async () => {
    const res = await POST(request({ headers: { host: 'LocalHost:3100', origin: 'https://localhost:3100' } }));
    expect(res.status).toBe(200);
    await res.text();
  });

  it('text/plain → 415; missing or other content-type → 415; application/json with parameters is accepted', async () => {
    expect((await POST(request({ headers: { 'content-type': 'text/plain' } }))).status).toBe(415);
    expect((await POST(request({ headers: { 'content-type': 'application/json-patch+json' } }))).status).toBe(415);
    const none = request({ headers: { 'content-type': '' }, body: new Blob([JSON.stringify({ clientId: IDS.clientA1, question: 'Hi' })]) });
    expect(none.headers.get('content-type')).toBeNull();
    expect((await POST(none)).status).toBe(415);
    const res = await POST(request({ headers: { 'content-type': ' Application/JSON ; charset=utf-8' } }));
    expect(res.status).toBe(200);
    await res.text();
  });

  it('Content-Length 40000 → 413', async () => {
    const req = request({ body: 'x'.repeat(40000), headers: { 'content-length': '40000' } });
    expect((await POST(req)).status).toBe(413);
    expect(req.bodyUsed).toBe(false);
  });

  it('chunked 33 KB body without Content-Length → 413 and the stream is cancelled', async () => {
    const e = endless();
    const req = request({ body: e.stream });
    expect(req.headers.get('content-length')).toBeNull();
    expect((await POST(req)).status).toBe(413);
    expect(e.cancel).toHaveBeenCalled();
    expect(e.pulled()).toBeGreaterThan(ASK_MAX_BODY_BYTES);
    expect(e.pulled()).toBeLessThanOrEqual(ASK_MAX_BODY_BYTES + 4 * 1024);
    expect(await dbs.owner.select().from(askMessage)).toHaveLength(0);
  });

  it('a chunked body exactly at the cap without Content-Length is read', async () => {
    const json = JSON.stringify({ clientId: IDS.clientA1, question: 'What changed?' });
    const padded = new TextEncoder().encode(json.padEnd(ASK_MAX_BODY_BYTES, ' '));
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < padded.length; i += 1000) c.enqueue(padded.slice(i, i + 1000));
        c.close();
      },
    });
    const res = await POST(request({ body: stream }));
    expect(res.status).toBe(200);
    await res.text();
  });

  it('invalid JSON → 400', async () => {
    expect((await POST(request({ body: '{not json' }))).status).toBe(400);
    expect((await POST(request({ body: '' }))).status).toBe(400);
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

  it('pre-persist error final has messageId null', async () => {
    m.depsFail = true;
    const evs = await events(await post({ clientId: IDS.clientA1, question: 'What changed?' }));
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ type: 'final', status: 'error', messageId: null });
  });

  it('a failure before the turn starts → error final with the default name', async () => {
    m.depsFail = true;
    const res = await post({ clientId: IDS.clientA1, question: 'What changed?' });
    expect(res.headers.get('x-ask-thread-id')).toBeNull();
    const evs = await events(res);
    expect(evs).toEqual([{ type: 'final', messageId: null, content: ASK_COPY.error('Friday'), citations: [], action: null, status: 'error' }]);
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

describe('readCappedJson', () => {
  it('parses JSON; refuses empty, invalid UTF-8 and over-cap bodies', async () => {
    expect(await readCappedJson(request({ body: '{"a":1}' }), 100)).toEqual({ ok: true, value: { a: 1 } });
    expect(await readCappedJson(request({ body: null }), 100)).toEqual({ ok: false, status: 400 });
    expect(await readCappedJson(request({ body: new Uint8Array([0x22, 0xff, 0x22]) }), 100)).toEqual({ ok: false, status: 400 });
    expect(await readCappedJson(request({ body: `"${'x'.repeat(98)}"` }), 100)).toEqual({ ok: true, value: 'x'.repeat(98) });
    expect(await readCappedJson(request({ body: `"${'x'.repeat(99)}"` }), 100)).toEqual({ ok: false, status: 413 });
  });
});

describe('POST /api/ask/turn and billing state (9a)', () => {
  it('a read_only agency gets one error final with role-aware copy, no thread or message, and no quota or model use; a serviceable agency is unaffected', async () => {
    await pauseAgency(dbs.owner, IDS.agencyA);
    const res = await post({ clientId: IDS.clientA1, question: 'What changed?' });
    expect(res.status).toBe(200);
    expect(await events(res)).toEqual([{ type: 'final', messageId: null, content: 'This workspace is temporarily unavailable.', citations: [], action: null, status: 'error' }]);
    expect(await dbs.owner.select().from(askMessage)).toHaveLength(0);
    m.viewer = userViewer(ctxFor({ role: 'agency_admin', clientScope: 'all', features: ['ask'] }));
    const admin = await events(await post({ clientId: IDS.clientA1, question: 'What changed?' }));
    expect(admin).toEqual([{ type: 'final', messageId: null, content: 'Service is paused. Update your payment method to resume.', citations: [], action: null, status: 'error' }]);
    expect(await dbs.owner.select().from(askMessage)).toHaveLength(0);
  });
});

describe('POST /api/ask/turn and the AI guard (7b1)', () => {
  const pausing = (reason: 'platform' | 'client'): AiGuard => ({
    assertAllowed: async (scope) => {
      if (scope.clientId === null) { if (reason === 'platform') throw new AiPausedError('platform'); return; }
      throw new AiPausedError(reason);
    },
  });
  it('route emits exactly one final with C4 (client pause), stored refused, no model call', async () => {
    m.guard = pausing('client');
    const res = await post({ clientId: IDS.clientA1, question: 'What changed?' });
    const evs = await events(res);
    const rows = await dbs.owner.select().from(askMessage).where(eq(askMessage.role, 'assistant'));
    expect(rows).toHaveLength(1);
    expect(evs).toEqual([{ type: 'final', messageId: rows[0]!.id, content: ASK_COPY.paused, citations: [], action: null, status: 'refused' }]);
    expect(ASK_COPY.paused).toBe('Ask is paused for the rest of this month. Your past answers are still here.');
    expect(rows[0]).toMatchObject({ status: 'refused' });
  });
  it('a platform pause answers C5; agency roles are refused too', async () => {
    m.guard = pausing('platform');
    m.viewer = userViewer(ctxFor({ role: 'agency_admin', clientScope: 'all', features: ['ask'] }));
    const evs = await events(await post({ clientId: IDS.clientA1, question: 'What changed?' }));
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ type: 'final', content: SYSTEM_BUSY_COPY, status: 'refused' });
  });
  it('an unpaused guard lets the turn run', async () => {
    m.guard = { assertAllowed: async () => {} } satisfies AiGuard;
    const evs = await events(await post({ clientId: IDS.clientA1, question: 'What changed?' }));
    expect(evs.at(-1)).toMatchObject({ type: 'final', status: 'ok' });
  });
  it('a client pause that surfaces mid-turn (after the pre-turn check passed) ends with one final carrying the C4 copy', async () => {
    m.guard = { assertAllowed: async () => {} } satisfies AiGuard;
    m.script = [{ kind: 'chat', reply: () => { throw new AiPausedError('client'); } }];
    const evs = await events(await post({ clientId: IDS.clientA1, question: 'What changed?' }));
    expect(evs.filter((e) => e.type === 'final')).toHaveLength(1);
    expect(evs.at(-1)).toMatchObject({ type: 'final', content: ASK_COPY.paused, status: 'error' });
  });
  it('a platform pause that surfaces mid-turn ends with the C5 busy copy', async () => {
    m.guard = { assertAllowed: async () => {} } satisfies AiGuard;
    m.script = [{ kind: 'chat', reply: () => { throw new AiPausedError('platform'); } }];
    const evs = await events(await post({ clientId: IDS.clientA1, question: 'What changed?' }));
    expect(evs.at(-1)).toMatchObject({ type: 'final', content: ASK_COPY.busy, status: 'error' });
  });
});
