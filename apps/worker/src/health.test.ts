import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { healthStatus, startHealthServer, type HealthState } from './health';

const T0 = new Date('2026-10-20T10:00:00Z');
const at = (s: number) => new Date(T0.getTime() + s * 1000);

describe('healthStatus', () => {
  it('is healthy right after start, before any heartbeat', () => {
    expect(healthStatus({ startedAt: T0, lastHeartbeatAt: null, queueGrantsOk: null }, at(1))).toEqual({ ok: true, heartbeatAgeS: null, queueGrants: null });
  });
  it('is unhealthy at 660 s + 1 after the last beat, healthy at 660 s', () => {
    const s: HealthState = { startedAt: T0, lastHeartbeatAt: T0, queueGrantsOk: true };
    expect(healthStatus(s, at(660)).ok).toBe(true);
    expect(healthStatus(s, at(661))).toEqual({ ok: false, heartbeatAgeS: 661, queueGrants: 'ok' });
  });
  it('a beat resets the age', () => {
    const s: HealthState = { startedAt: T0, lastHeartbeatAt: at(600), queueGrantsOk: true };
    expect(healthStatus(s, at(1200))).toEqual({ ok: true, heartbeatAgeS: 600, queueGrants: 'ok' });
  });
  it('not started is unhealthy', () => {
    expect(healthStatus({ startedAt: null, lastHeartbeatAt: null, queueGrantsOk: null }, T0)).toEqual({ ok: false, heartbeatAgeS: null, queueGrants: null });
  });
  it('failing queue grants make it unhealthy even with a fresh beat', () => {
    expect(healthStatus({ startedAt: T0, lastHeartbeatAt: at(10), queueGrantsOk: false }, at(20))).toEqual({ ok: false, heartbeatAgeS: 10, queueGrants: 'failed' });
  });
});

describe('startHealthServer', () => {
  let server: ReturnType<typeof startHealthServer> | undefined;
  afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

  it('serves /healthz as 200 then 503 via the clock, 404 elsewhere', async () => {
    const { healthState } = await import('./health');
    healthState.startedAt = T0;
    healthState.lastHeartbeatAt = T0;
    healthState.queueGrantsOk = true;
    let now = at(10);
    server = startHealthServer(0, () => now);
    await new Promise((r) => server!.once('listening', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const ok = await fetch(`${base}/healthz`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('cache-control')).toBe('no-store');
    expect(await ok.json()).toEqual({ ok: true, heartbeatAgeS: 10, queueGrants: 'ok' });
    now = at(700);
    const bad = await fetch(`${base}/healthz`);
    expect(bad.status).toBe(503);
    expect(await bad.json()).toEqual({ ok: false, heartbeatAgeS: 700, queueGrants: 'ok' });
    expect((await fetch(`${base}/other`)).status).toBe(404);
    expect((await fetch(`${base}/healthz`, { method: 'POST' })).status).toBe(404);
  });

  it('healthz is 503 while queue grants fail', async () => {
    const { healthState } = await import('./health');
    Object.assign(healthState, { startedAt: T0, lastHeartbeatAt: T0, queueGrantsOk: false });
    server = startHealthServer(0, () => at(10));
    await new Promise((r) => server!.once('listening', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, heartbeatAgeS: 10, queueGrants: 'failed' });
    healthState.queueGrantsOk = true;
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
  });
});
