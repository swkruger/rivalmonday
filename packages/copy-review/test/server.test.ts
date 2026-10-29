import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { refuseReason } from '../src/cli/review.js';
import { LedgerError, loadLedger } from '../src/ledger.js';
import { createServer } from '../src/server/app.js';
import type { CopyItem } from '../src/types.js';

const item = (o: Partial<CopyItem> = {}): CopyItem => ({
  surface: 'help', file: 'a.ts', line: 3, anchor: 'a.ts#x#0', context: 'x', text: 'Hello', hash: 'a'.repeat(16), kind: 'string', ...o,
});
const ITEMS: CopyItem[] = [
  item(),
  item({ anchor: 'a.ts#x#1', text: 'Second', hash: 'b'.repeat(16), line: 4 }),
  item({ anchor: 'a.ts#x#2', text: 'Third', hash: 'c'.repeat(16), line: 5 }),
  item({
    surface: 'emails', file: 'packages/email/previews/welcome', anchor: 'email:welcome', text: 'Subject: Hi\n\nBody',
    hash: 'd'.repeat(16), kind: 'email', html: '<p>Hi <b>there</b></p>', line: 1,
  }),
];

let servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  servers = [];
});

async function start(opts: { ledger?: string } = {}) {
  const ledgerPath = join(mkdtempSync(join(tmpdir(), 'srv-')), 'signoff.json');
  if (opts.ledger !== undefined) writeFileSync(ledgerPath, opts.ledger);
  const server = createServer({
    root: '/repo', ledgerPath, collect: async () => ITEMS, now: () => '2026-10-29', who: () => 'Owner',
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return { ledgerPath, port };
}

interface Res { status: number; headers: Record<string, string | string[] | undefined>; body: string }
function call(
  port: number, method: string, path: string,
  o: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<Res> {
  const body = o.body === undefined ? undefined : JSON.stringify(o.body);
  const headers: Record<string, string> = { host: `127.0.0.1:${port}`, ...o.headers };
  if (body !== undefined && !('content-type' in headers)) headers['content-type'] = 'application/json';
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}
const json = (r: Res) => JSON.parse(r.body);
const ref = (i: CopyItem) => ({ file: i.file, hash: i.hash });

describe('copy-review server', () => {
  it('GET /api/items filters by surface and status', async () => {
    const { port } = await start();
    await call(port, 'POST', '/api/sign', { body: { items: [ref(ITEMS[0]!)] } });
    const r = await call(port, 'GET', '/api/items?surface=help&status=unsigned');
    expect(r.status).toBe(200);
    const b = json(r);
    expect(b.items.map((i: CopyItem) => i.hash)).toEqual(['b'.repeat(16), 'c'.repeat(16)]);
    expect(b.counts.help.signed).toBe(1);
    expect(b.counts.help.unsigned).toBe(2);
    expect(b.counts.emails.unsigned).toBe(1);
    const q = json(await call(port, 'GET', '/api/items?q=third'));
    expect(q.items.map((i: CopyItem) => i.text)).toEqual(['Third']);
  });

  it('sign then item is signed and ledger file updated', async () => {
    const { port, ledgerPath } = await start();
    const r = await call(port, 'POST', '/api/sign', { body: { items: [ref(ITEMS[1]!)] } });
    expect(r.status).toBe(200);
    expect(json(r).counts.help.signed).toBe(1);
    const l = loadLedger(ledgerPath);
    expect(l.entries).toEqual([
      { type: 'sign', file: 'a.ts', hash: 'b'.repeat(16), anchor: 'a.ts#x#1', text: 'Second', at: '2026-10-29', by: 'Owner' },
    ]);
    const items = json(await call(port, 'GET', '/api/items?status=signed')).items;
    expect(items.map((i: CopyItem) => i.hash)).toEqual(['b'.repeat(16)]);
    const u = await call(port, 'POST', '/api/unsign', { body: { items: [ref(ITEMS[1]!)] } });
    expect(u.status).toBe(200);
    expect(loadLedger(ledgerPath).entries).toEqual([]);
  });

  it('group sign only signs posted items', async () => {
    const { port, ledgerPath } = await start();
    const r = await call(port, 'POST', '/api/sign', { body: { items: [ref(ITEMS[0]!), ref(ITEMS[2]!)] } });
    expect(r.status).toBe(200);
    expect(loadLedger(ledgerPath).entries.map((e) => e.hash).sort()).toEqual(['a'.repeat(16), 'c'.repeat(16)]);
  });

  it('unknown item → 409, ledger unchanged', async () => {
    const before = '{"version":1,"entries":[\n]}\n';
    const { port, ledgerPath } = await start({ ledger: before });
    const r = await call(port, 'POST', '/api/sign', {
      body: { items: [ref(ITEMS[0]!), { file: 'gone.ts', hash: 'f'.repeat(16) }] },
    });
    expect(r.status).toBe(409);
    expect(json(r).unknown).toEqual([{ file: 'gone.ts', hash: 'f'.repeat(16) }]);
    expect(readFileSync(ledgerPath, 'utf8')).toBe(before);
  });

  it('comment then todo flag set', async () => {
    const { port, ledgerPath } = await start();
    const r = await call(port, 'POST', '/api/comment', {
      body: { ...ref(ITEMS[0]!), comment: 'Too formal', suggestion: 'Hi' },
    });
    expect(r.status).toBe(200);
    expect(json(r).counts.help.needsEdit).toBe(1);
    const [e] = loadLedger(ledgerPath).entries;
    expect(e).toMatchObject({ type: 'comment', comment: 'Too formal', suggestion: 'Hi', by: 'Owner' });
    const items = json(await call(port, 'GET', '/api/items?surface=help')).items;
    expect(items.find((i: CopyItem) => i.hash === 'a'.repeat(16)).needsEdit).toBe(true);
  });

  it('two concurrent signs both land', async () => {
    const { port, ledgerPath } = await start();
    const [a, b] = await Promise.all([
      call(port, 'POST', '/api/sign', { body: { items: [ref(ITEMS[0]!)] } }),
      call(port, 'POST', '/api/ignore', { body: { items: [ref(ITEMS[1]!)] } }),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(loadLedger(ledgerPath).entries.map((e) => e.type).sort()).toEqual(['ignore', 'sign']);
  });

  it('foreign Host → 403', async () => {
    const { port } = await start();
    expect((await call(port, 'GET', '/api/items', { headers: { host: `evil.example:${port}` } })).status).toBe(403);
    expect((await call(port, 'GET', '/api/items', { headers: { host: `127.0.0.1:${port + 1}` } })).status).toBe(403);
    expect((await call(port, 'GET', '/api/items', { headers: { host: `localhost:${port}` } })).status).toBe(200);
  });

  it('cross-origin POST → 403', async () => {
    const { port, ledgerPath } = await start();
    const body = { items: [ref(ITEMS[0]!)] };
    expect((await call(port, 'POST', '/api/sign', { body, headers: { origin: 'https://evil.example' } })).status).toBe(403);
    expect((await call(port, 'POST', '/api/sign', { body, headers: { origin: 'null' } })).status).toBe(403);
    expect((await call(port, 'POST', '/api/sign', { body, headers: { 'content-type': 'text/plain' } })).status).toBe(403);
    expect(existsSync(ledgerPath)).toBe(false);
    expect((await call(port, 'POST', '/api/sign', { body, headers: { origin: `http://localhost:${port}` } })).status).toBe(200);
  });

  it('rejects invalid bodies and oversize bodies', async () => {
    const { port, ledgerPath } = await start();
    expect((await call(port, 'POST', '/api/sign', { body: { items: [] } })).status).toBe(400);
    expect((await call(port, 'POST', '/api/sign', { body: { items: [{ file: 1 }] } })).status).toBe(400);
    expect((await call(port, 'POST', '/api/comment', { body: { ...ref(ITEMS[0]!), comment: '' } })).status).toBe(400);
    const big = { items: [{ file: 'x'.repeat(1_100_000), hash: 'a' }] };
    expect((await call(port, 'POST', '/api/sign', { body: big })).status).toBe(413);
    expect(existsSync(ledgerPath)).toBe(false);
  });

  it('GET /preview/:id serves html with CSP header', async () => {
    const { port } = await start();
    const r = await call(port, 'GET', '/preview/welcome');
    expect(r.status).toBe(200);
    expect(r.headers['content-security-policy']).toBe("default-src 'none'; img-src data: https:; style-src 'unsafe-inline'");
    expect(r.headers['content-type']).toMatch(/^text\/html/);
    expect(r.body).toBe('<p>Hi <b>there</b></p>');
    expect((await call(port, 'GET', '/preview/nope')).status).toBe(404);
  });

  it('GET / returns HTML without echoing raw input', async () => {
    const { port } = await start();
    const r = await call(port, 'GET', '/?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/^text\/html/);
    expect(r.body).not.toContain('<script>alert(1)');
  });

  it('malformed ledger → server refuses to start', () => {
    const ledgerPath = join(mkdtempSync(join(tmpdir(), 'srv-')), 'signoff.json');
    writeFileSync(ledgerPath, '{bad');
    expect(() => createServer({ root: '/repo', ledgerPath, collect: async () => ITEMS })).toThrow(LedgerError);
  });

  it('review refuses to run on Vercel or in production', () => {
    expect(refuseReason({ VERCEL: '1' })).toMatch(/VERCEL/);
    expect(refuseReason({ NODE_ENV: 'production' })).toMatch(/production/);
    expect(refuseReason({ NODE_ENV: 'development' })).toBeUndefined();
  });
});
