/**
 * 7c2 rehearsal fixture websites (plan Decision 11): one HTTP service answering for `FIXTURE_HOSTS`
 * (`fx1…fx5.rehearsal.rivalmonday.app`) with `@cs/collectors` `fixtureResponse`. Staging only.
 *
 *   pnpm --filter @cs/worker fixture-hosts          (Railway: node --import tsx src/cli/fixture-hosts.ts)
 *
 * Env: `PORT` (default 8080), `FIXTURE_HOSTS` (comma-separated, required), `FIXTURE_LOG_TOKEN` (enables
 * `GET /__rehearsal/log` with `Authorization: Bearer <token>`; unset = the route 404s). `GET /healthz` answers 200 on
 * any host (Railway health check).
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { fixtureResponse } from '@cs/collectors';
import { rehearsalAllowed } from '../env';

export const FIXTURE_LOG_RING = 50_000;
export interface FixtureLogEntry { host: string; path: string; at: string; ua: string }
const LOG_PATH = '/__rehearsal/log';

/** Constant-time: both sides are hashed to 32 bytes first, so the lengths always match. */
function tokenMatches(header: string | undefined, token: string): boolean {
  const given = /^Bearer (.+)$/.exec(header ?? '')?.[1] ?? '';
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(given), digest(token)) && given.length > 0;
}

/** Throws when the service must not run (production, or no hosts); otherwise listens on `PORT`. */
export function startFixtureHosts(env: NodeJS.ProcessEnv, now: () => Date = () => new Date()): Server {
  if (!rehearsalAllowed(env)) throw new Error('fixture-hosts runs only on staging (SENTRY_ENVIRONMENT=staging) or outside production');
  const hosts = new Set((env.FIXTURE_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean));
  if (hosts.size === 0) throw new Error('FIXTURE_HOSTS is required (comma-separated host names)');
  const token = env.FIXTURE_LOG_TOKEN?.trim() || null;
  const ring: FixtureLogEntry[] = [];
  let next = 0; // ring write position once full

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    const path = req.url ?? '/';
    // Railway's health check (shared railway.json) arrives with its own Host header: answer it on any host, unlogged.
    if (path === '/healthz') return void res.writeHead(200, { 'content-type': 'text/plain' }).end('ok\n');
    if (path.split('?')[0] === LOG_PATH) {
      if (!token || req.method !== 'GET') return void res.writeHead(404).end();
      if (!tokenMatches(req.headers.authorization, token)) return void res.writeHead(401).end();
      const entries = ring.length < FIXTURE_LOG_RING ? ring : [...ring.slice(next), ...ring.slice(0, next)];
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ entries }));
      return;
    }
    const host = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
    const at = now();
    const entry = { host, path, at: at.toISOString(), ua: req.headers['user-agent'] ?? '' };
    if (ring.length < FIXTURE_LOG_RING) ring.push(entry);
    else { ring[next] = entry; next = (next + 1) % FIXTURE_LOG_RING; }
    if (!hosts.has(host) || (req.method !== 'GET' && req.method !== 'HEAD')) return void res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found\n');
    const r = fixtureResponse(host, path, at);
    res.writeHead(r.status, r.headers).end(req.method === 'HEAD' ? undefined : r.body);
  };

  const server = createServer(handler);
  server.listen(Number(env.PORT ?? 8080));
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const server = startFixtureHosts(process.env);
    server.once('listening', () => console.log(`[fixture-hosts] listening on ${process.env.PORT ?? 8080} for ${process.env.FIXTURE_HOSTS}`));
    process.once('SIGTERM', () => server.close(() => process.exit(0)));
  } catch (err) {
    console.error(`[fixture-hosts] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
