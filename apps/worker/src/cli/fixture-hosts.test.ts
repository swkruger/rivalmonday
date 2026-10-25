import { request } from 'node:http';
import type { AddressInfo, Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { FIXTURE_LOG_RING, startFixtureHosts } from './fixture-hosts';

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

async function start(env: NodeJS.ProcessEnv, opts: { ringSize?: number } = {}): Promise<number> {
  const server = startFixtureHosts({ PORT: '0', FIXTURE_HOSTS: 'fx1.rehearsal.example, FX5.rehearsal.example', ...env }, opts);
  servers.push(server);
  await new Promise<void>((r) => (server.listening ? r() : server.once('listening', () => r())));
  return (server.address() as AddressInfo).port;
}

function get(port: number, host: string, path: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string; type: string | undefined }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, headers: { host, 'user-agent': 'RivalMondayBot/1.0', ...headers } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body, type: res.headers['content-type'] }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('fixture-hosts server', () => {
  it('unknown host 404', async () => {
    const port = await start({ NODE_ENV: 'development' });
    expect((await get(port, 'evil.example', '/robots.txt')).status).toBe(404);
    expect((await get(port, 'evil.example', '/g1/s1/')).status).toBe(404);
    expect((await get(port, 'healthcheck.railway.app', '/healthz')).status).toBe(200);
    const robots = await get(port, 'fx5.rehearsal.example:443', '/robots.txt');
    expect(robots.status).toBe(200);
    expect(robots.body).toMatch(/Crawl-delay: 30/);
    const page = await get(port, 'FX1.rehearsal.example', '/g3/s1/pricing');
    expect(page.status).toBe(200);
    expect(page.type).toMatch(/^text\/html/);
  });

  it('log needs the token', async () => {
    const port = await start({ SENTRY_ENVIRONMENT: 'staging', NODE_ENV: 'production', FIXTURE_LOG_TOKEN: 'secret-token' });
    await get(port, 'fx1.rehearsal.example', '/g1/s1/');
    await get(port, 'evil.example', '/g1/s1/');
    await get(port, 'fx1.rehearsal.example', '/robots.txt');
    expect((await get(port, 'fx1.rehearsal.example', '/__rehearsal/log')).status).toBe(401);
    expect((await get(port, 'fx1.rehearsal.example', '/__rehearsal/log', { authorization: 'Bearer secret-tokeX' })).status).toBe(401);
    expect((await get(port, 'fx1.rehearsal.example', '/__rehearsal/log', { authorization: 'Bearer short' })).status).toBe(401);
    const ok = await get(port, 'anything.example', '/__rehearsal/log', { authorization: 'Bearer secret-token' });
    expect(ok.status).toBe(200);
    const { entries, unknownHostRequests } = JSON.parse(ok.body) as { entries: { host: string; path: string; at: string; ua: string }[]; unknownHostRequests: number };
    expect(unknownHostRequests).toBe(1);
    expect(entries.map((e) => [e.host, e.path, e.ua])).toEqual([
      ['fx1.rehearsal.example', '/g1/s1/', 'RivalMondayBot/1.0'],
      ['fx1.rehearsal.example', '/robots.txt', 'RivalMondayBot/1.0'],
    ]);
    expect(Number.isNaN(Date.parse(entries[0]!.at))).toBe(false);

    // Unset token ⇒ the log route does not exist.
    const noToken = await start({ NODE_ENV: 'development' });
    expect((await get(noToken, 'fx1.rehearsal.example', '/__rehearsal/log', { authorization: 'Bearer ' })).status).toBe(404);
    expect(FIXTURE_LOG_RING).toBe(50_000);
  });

  it('the log ring keeps the newest entries, oldest first, and truncates long fields', async () => {
    const port = await start({ NODE_ENV: 'development', FIXTURE_LOG_TOKEN: 't0k' }, { ringSize: 3 });
    for (const p of ['/a', '/b', '/c', '/d', '/e']) await get(port, 'fx1.rehearsal.example', p);
    await get(port, 'fx1.rehearsal.example', `/${'x'.repeat(600)}`, { 'user-agent': 'u'.repeat(600) });
    const res = await get(port, 'fx1.rehearsal.example', '/__rehearsal/log', { authorization: 'Bearer t0k' });
    const { entries } = JSON.parse(res.body) as { entries: { path: string; ua: string }[] };
    expect(entries.map((e) => e.path.slice(0, 2))).toEqual(['/d', '/e', '/x']);
    expect(entries[2]!.path).toHaveLength(512);
    expect(entries[2]!.ua).toHaveLength(512);
  });

  it('refuses to start in production', () => {
    expect(() => startFixtureHosts({ NODE_ENV: 'production', FIXTURE_HOSTS: 'fx1.rehearsal.example' })).toThrow(/staging/);
    expect(() => startFixtureHosts({ FIXTURE_HOSTS: 'fx1.rehearsal.example' })).toThrow(/staging/);
    expect(() => startFixtureHosts({ NODE_ENV: 'development', FIXTURE_HOSTS: ' , ' })).toThrow(/FIXTURE_HOSTS/);
  });
});
