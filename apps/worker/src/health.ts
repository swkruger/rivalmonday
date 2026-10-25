import { createServer, type Server } from 'node:http';

/** `queueGrantsOk`: result of the last `ensureQueueGrants` (start-up, then every heartbeat); `null` = not tried yet. */
export interface HealthState { startedAt: Date | null; lastHeartbeatAt: Date | null; queueGrantsOk: boolean | null }
export const healthState: HealthState = { startedAt: null, lastHeartbeatAt: null, queueGrantsOk: null };

/** The heartbeat cron runs every 5 minutes; 660 s tolerates one missed beat. boss.start() counts as the first beat. */
const MAX_AGE_S = 660;

/** 7c2: unhealthy while the cs_web queue grants fail (web enqueues are refused), so the deploy health check catches it. */
export function healthStatus(s: HealthState, now: Date): { ok: boolean; heartbeatAgeS: number | null; queueGrants: 'ok' | 'failed' | null } {
  const heartbeatAgeS = s.lastHeartbeatAt ? Math.floor((now.getTime() - s.lastHeartbeatAt.getTime()) / 1000) : null;
  const queueGrants = s.queueGrantsOk === null ? null : s.queueGrantsOk ? 'ok' : 'failed';
  if (!s.startedAt) return { ok: false, heartbeatAgeS, queueGrants };
  const last = s.lastHeartbeatAt && s.lastHeartbeatAt > s.startedAt ? s.lastHeartbeatAt : s.startedAt;
  return { ok: (now.getTime() - last.getTime()) / 1000 <= MAX_AGE_S && s.queueGrantsOk !== false, heartbeatAgeS, queueGrants };
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
