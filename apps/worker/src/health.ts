import { createServer, type Server } from 'node:http';

export interface HealthState { startedAt: Date | null; lastHeartbeatAt: Date | null }
export const healthState: HealthState = { startedAt: null, lastHeartbeatAt: null };

/** The heartbeat cron runs every 5 minutes; 660 s tolerates one missed beat. boss.start() counts as the first beat. */
const MAX_AGE_S = 660;

export function healthStatus(s: HealthState, now: Date): { ok: boolean; heartbeatAgeS: number | null } {
  const heartbeatAgeS = s.lastHeartbeatAt ? Math.floor((now.getTime() - s.lastHeartbeatAt.getTime()) / 1000) : null;
  if (!s.startedAt) return { ok: false, heartbeatAgeS };
  const last = s.lastHeartbeatAt && s.lastHeartbeatAt > s.startedAt ? s.lastHeartbeatAt : s.startedAt;
  return { ok: (now.getTime() - last.getTime()) / 1000 <= MAX_AGE_S, heartbeatAgeS };
}

export function startHealthServer(port: number, now: () => Date = () => new Date()): Server {
  const server = createServer((req, res) => {
    if (req.method !== 'GET' || req.url?.split('?')[0] !== '/healthz') {
      res.writeHead(404).end();
      return;
    }
    const st = healthStatus(healthState, now());
    res.writeHead(st.ok ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify(st));
  });
  server.listen(port);
  return server;
}
