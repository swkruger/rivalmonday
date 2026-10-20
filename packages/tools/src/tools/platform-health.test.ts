import { createAccessContext } from '@cs/core';
import { capture, vendorCall } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import type { QueueStatsLookup, ToolDeps } from '../deps';
import { createToolRegistry } from '../registry';
import type { PlatformHealth } from '../platform/system-health';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const NOW = new Date('2026-10-20T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const HOUR = 3_600_000;
const queueStats = vi.fn<QueueStatsLookup>(async () => ({ queues: [], lastHeartbeatAt: null }));
const deps: ToolDeps = { app: dbs.app, service: dbs.service, platformAdmins: ['op@example.com'], queueStats, sentryIssuesUrl: 'https://sentry.example/issues' };
const registry = createToolRegistry(deps, { audit: { record: async () => {} } });
const ctxOf = (userId: string, role: 'agency_admin' | 'client_viewer' = 'agency_admin') =>
  createAccessContext({ agencyId: IDS.agencyA, userId, role, clientScope: role === 'agency_admin' ? 'all' : [IDS.clientA1], features: [] });
const health = () => registry.invoke(ctxOf('op'), 'get_platform_health', {}) as Promise<PlatformHealth>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  queueStats.mockReset();
  queueStats.mockResolvedValue({ queues: [], lastHeartbeatAt: null });
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await truncateAuth(dbs.owner);
  for (const u of ['op', 'admin', 'guest']) await seedUser(dbs.owner, u, `${u}@example.com`);
});
afterEach(() => vi.useRealTimers());

describe('get_platform_health', () => {
  it('non-operator agency admin and guest contact are refused (the page turns it into a 404)', async () => {
    await expect(registry.invoke(ctxOf('admin'), 'get_platform_health', {})).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(registry.invoke(ctxOf('guest', 'client_viewer'), 'get_platform_health', {})).rejects.toMatchObject({ code: expect.stringMatching(/permission_denied|not_found/) });
  });

  it('refuses with internal when queue stats are not configured', async () => {
    const bare = createToolRegistry({ ...deps, queueStats: undefined }, { audit: { record: async () => {} } });
    await expect(bare.invoke(ctxOf('op'), 'get_platform_health', {})).rejects.toMatchObject({ code: 'internal', message: 'Queue status is not configured' });
  });

  it('an unreachable queue database reads as worker down, not an error', async () => {
    queueStats.mockRejectedValue(new Error('connection refused'));
    const out = await health();
    expect(out.worker).toEqual({ lastHeartbeatAt: null, status: 'down' });
    expect(out.queues).toEqual([]);
  });

  it('empty DB: worker down, no queues or vendors, sources down, no divide-by-zero', async () => {
    const out = await health();
    expect(out.worker).toEqual({ lastHeartbeatAt: null, status: 'down' });
    expect(out.queues).toEqual([]);
    expect(out.vendors).toEqual([]);
    expect(out.sources.map((s) => [s.kind, s.status])).toEqual([['vendor_call', 'down'], ['capture', 'down']]);
    expect(out.sentryUrl).toBe('https://sentry.example/issues');
  });

  it('aggregates vendor calls over 48 h, error rate inputs over 24 h, and the latest ok source rows', async () => {
    const row = (vendor: string, ok: boolean, msAgo: number) => ({ vendor, operation: 'x', units: 1, latencyMs: 5, ok, createdAt: ago(msAgo) });
    await dbs.owner.insert(vendorCall).values([
      row('dataforseo', true, 2 * HOUR), row('dataforseo', false, 3 * HOUR), row('dataforseo', true, 30 * HOUR),
      row('outscraper', false, 1 * HOUR), row('outscraper', false, 2 * HOUR),
      row('old', true, 40 * HOUR), row('gone', true, 60 * HOUR),
    ]);
    await dbs.owner.insert(capture).values([
      { competitorId: IDS.competitorX, source: 'web', status: 'ok', collectorVersion: 't', capturedAt: ago(27 * HOUR) },
      { competitorId: IDS.competitorX, source: 'web', status: 'blocked', collectorVersion: 't', capturedAt: ago(1 * HOUR) },
    ]);
    queueStats.mockResolvedValue({ queues: [{ name: 'brief-pdf', queued: 1, active: 0, failed24h: 0, oldestQueuedAt: ago(3 * HOUR) }], lastHeartbeatAt: ago(60_000) });
    const out = await health();
    expect(out.worker.status).toBe('ok');
    expect(out.queues[0]).toMatchObject({ name: 'brief-pdf', status: 'down', oldestQueuedAgeS: 10800 });
    const by = Object.fromEntries(out.vendors.map((v) => [v.vendor, v]));
    expect(by.dataforseo).toMatchObject({ calls24h: 2, errors24h: 1, status: 'down' });
    expect(by.outscraper).toMatchObject({ calls24h: 2, errors24h: 2, lastOkAt: null, status: 'down' });
    expect(by.gone).toBeUndefined();
    expect(by.old).toMatchObject({ calls24h: 0, errors24h: 0, status: 'ok' });
    expect(out.sources.find((s) => s.kind === 'capture')).toMatchObject({ status: 'warn', lastOkAt: ago(27 * HOUR).toISOString() });
    expect(out.sources.find((s) => s.kind === 'vendor_call')).toMatchObject({ status: 'ok', lastOkAt: ago(2 * HOUR).toISOString() });
  });
});
