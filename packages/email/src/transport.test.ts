import type { LedgerSink, VendorCallRecord } from '@cs/core';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createConsoleTransport, createEmailTransportFromEnv, createFileTransport, createPostmarkTransport, isPostmarkTestServer, PermanentEmailError, POSTMARK_URL } from './transport';

const msg = { from: 'Acme <briefs@acme.example>', to: 'pat@a1.example', replyTo: 'sam@acme.example', subject: 'S', html: '<p>h</p>', text: 'h', tag: 'alert', metadata: { notification: 'n1' } };
const scope = { agencyId: 'a', clientId: 'c' };
function ledger() {
  const calls: VendorCallRecord[] = [];
  const sink: LedgerSink = { recordLlmCall: async () => {}, recordVendorCall: async (r) => { calls.push(r); } };
  return { sink, calls };
}
const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let dir: string | null = null;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = null;
});

describe('postmark transport', () => {
  it('posts the message with tracking off and records one ledger row', async () => {
    const l = ledger();
    let seen: { url: string; init: RequestInit } | null = null;
    const fetch = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return reply(200, { ErrorCode: 0, MessageID: 'pm-1', Message: 'OK' })();
    }) as unknown as typeof globalThis.fetch;
    const t = createPostmarkTransport({ token: 'tok', ledger: l.sink, fetch });
    expect(await t.send(msg, scope)).toEqual({ providerId: 'pm-1' });
    expect(seen!.url).toBe(POSTMARK_URL);
    expect((seen!.init.headers as Record<string, string>)['X-Postmark-Server-Token']).toBe('tok');
    const body = JSON.parse(String(seen!.init.body));
    expect(body).toMatchObject({ From: msg.from, To: msg.to, ReplyTo: msg.replyTo, Subject: 'S', HtmlBody: '<p>h</p>', TextBody: 'h', MessageStream: 'outbound', TrackOpens: false, TrackLinks: 'None', Tag: 'alert', Metadata: { notification: 'n1' } });
    expect(l.calls).toEqual([expect.objectContaining({ vendor: 'postmark', operation: 'email', units: 1, costUsd: 0.0015, ok: true, agencyId: 'a', clientId: 'c' })]);
  });

  it('throws a permanent error for an inactive recipient and a transient one for a server error', async () => {
    const l = ledger();
    const inactive = createPostmarkTransport({ token: 't', ledger: l.sink, fetch: reply(422, { ErrorCode: 406, Message: 'Inactive recipient' }) as unknown as typeof fetch });
    await expect(inactive.send(msg, scope)).rejects.toBeInstanceOf(PermanentEmailError);
    const down = createPostmarkTransport({ token: 't', ledger: l.sink, fetch: reply(503, { ErrorCode: 0, Message: 'Unavailable' }) as unknown as typeof fetch });
    const err = await down.send(msg, scope).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(PermanentEmailError);
    expect(l.calls.map((c) => [c.ok, c.costUsd])).toEqual([[false, null], [false, null]]);
  });
});

describe('Postmark test server (5b-2 decision 7)', () => {
  it('ledgers an accepted test-server send at $0 under email_test', async () => {
    const rows: VendorCallRecord[] = [];
    const ledger = { recordLlmCall: async () => {}, recordVendorCall: async (r: VendorCallRecord) => void rows.push(r) };
    const fetch = async () => new Response(JSON.stringify({ ErrorCode: 0, MessageID: 'm1' }), { status: 200 });
    const t = createPostmarkTransport({ token: 'x', ledger, fetch: fetch as typeof globalThis.fetch, testServer: true });
    await t.send(msg, { agencyId: null, clientId: null });
    expect(rows[0]).toMatchObject({ vendor: 'postmark', operation: 'email_test', costUsd: 0, ok: true });
  });

  it('detects a test server from POSTMARK_TEST_SERVER or the sandbox token', () => {
    expect(isPostmarkTestServer({ POSTMARK_SERVER_TOKEN: 'live' })).toBe(false);
    expect(isPostmarkTestServer({ POSTMARK_SERVER_TOKEN: 'live', POSTMARK_TEST_SERVER: 'true' })).toBe(true);
    expect(isPostmarkTestServer({ POSTMARK_SERVER_TOKEN: 'POSTMARK_API_TEST' })).toBe(true);
    expect(isPostmarkTestServer({ POSTMARK_SERVER_TOKEN: 'live', POSTMARK_TEST_SERVER: 'yes' })).toBe(false);
  });
});

describe('file transport', () => {
  it('writes the message as json and html', async () => {
    dir = await mkdtemp(join(tmpdir(), 'outbox-'));
    const r = await createFileTransport(dir).send(msg, scope);
    expect(r.providerId).toMatch(/^file:/);
    const files = (await readdir(dir)).sort();
    expect(files.map((f) => f.split('.').pop())).toEqual(['html', 'json']);
    expect(JSON.parse(await readFile(join(dir, files[1]!), 'utf8'))).toMatchObject({ to: msg.to, subject: 'S' });
  });

  it('is the default without a Postmark token', () => {
    expect(createEmailTransportFromEnv({ EMAIL_OUTBOX_DIR: '/tmp/x' }, ledger().sink).kind).toBe('file');
    expect(createEmailTransportFromEnv({ POSTMARK_SERVER_TOKEN: 'tok' }, ledger().sink).kind).toBe('postmark');
  });
});

describe('createConsoleTransport (demo spec §5.5)', () => {
  it('logs the message and sends nothing anywhere', async () => {
    const lines: string[] = [];
    const t = createConsoleTransport((l) => lines.push(l));
    const r = await t.send({ from: 'a@x.co', to: 'admin@demo.rivalmonday.test', replyTo: null, subject: 'Sign in', html: '<p>hi</p>', text: 'Open https://x/verify', tag: 'sign_in', metadata: {} }, { agencyId: null, clientId: null });
    expect(t.kind).toBe('console');
    expect(r.providerId).toMatch(/^console:/);
    expect(lines.join('\n')).toContain('admin@demo.rivalmonday.test');
    expect(lines.join('\n')).toContain('https://x/verify');
  });
});
