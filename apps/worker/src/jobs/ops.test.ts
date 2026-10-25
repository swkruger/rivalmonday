import { client, opsAlert, type OpsAlert } from '@cs/db';
import { checkBriefReadiness } from '@cs/engine';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { workerLog } from '../log';
import { createOpsJobs } from './ops';

const dbs = openTestDbs();
afterAll(() => {
  vi.useRealTimers();
  return dbs.closeAll();
});
beforeEach(async () => {
  // A Thursday afternoon (Chicago): no weekly checkpoint is open, so only the late starting points are reported.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-22T20:00:00Z'));
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  // Created long ago with no starting point: every seeded client has a late starting point (three open alerts).
  await dbs.owner.update(client).set({ createdAt: new Date('2026-01-01T00:00:00Z') });
  vi.restoreAllMocks();
  vi.spyOn(workerLog, 'info').mockImplementation(() => {});
});

function makeDeps(o: { engine?: boolean; recipients?: string[]; send?: (to: string, a: OpsAlert) => Promise<void> } = {}) {
  const send = vi.fn(o.send ?? (async () => {}));
  const deps = {
    engineConfigured: () => o.engine ?? true,
    serviceDb: () => dbs.service,
    briefReadiness: () => ({ run: (now: Date) => checkBriefReadiness(dbs.service, now), send, recipients: async () => o.recipients ?? ['a@x.test', 'b@x.test'] }),
  } as unknown as WorkerDeps;
  return { deps, send };
}

describe('brief-readiness job', () => {
  it('declares name, cron, short queue and accepts cron data', () => {
    const { readiness } = createOpsJobs({} as WorkerDeps);
    expect(readiness).toMatchObject({ name: 'brief-readiness', cron: '25 * * * *', queue: { policy: 'short', retryLimit: 1, expireInSeconds: 600 } });
    expect(readiness.schema.safeParse({}).success).toBe(true);
    expect(readiness.schema.safeParse({ _cron: true }).success).toBe(true);
  });

  it('skips without engine', async () => {
    const { deps, send } = makeDeps({ engine: false });
    expect(await createOpsJobs(deps).readiness.handler({})).toEqual({ skipped: 'engine_unconfigured' });
    expect(send).not.toHaveBeenCalled();
    expect(await dbs.owner.select().from(opsAlert)).toEqual([]);
  });

  it('emails every recipient once', async () => {
    const { deps, send } = makeDeps();
    expect(await createOpsJobs(deps).readiness.handler({})).toEqual({ open: 3, emailed: 3, resolved: 0 });
    expect(send).toHaveBeenCalledTimes(6);
    expect(send.mock.calls.filter(([to]) => to === 'a@x.test')).toHaveLength(3);
    expect((await dbs.owner.select().from(opsAlert)).every((a) => a.emailedAt !== null)).toBe(true);
    // The next tick finds nothing left to email.
    expect(await createOpsJobs(deps).readiness.handler({})).toEqual({ open: 3, emailed: 0, resolved: 0 });
    expect(send).toHaveBeenCalledTimes(6);
  });

  it('a failed send keeps emailed_at null', async () => {
    const err = vi.spyOn(workerLog, 'error').mockImplementation(() => {});
    const { deps } = makeDeps({
      send: async (to, a) => {
        if (to === 'b@x.test' && (a.summary as { clients: { clientId: string }[] }).clients[0]!.clientId === IDS.clientA1) throw new Error('smtp down');
      },
    });
    expect(await createOpsJobs(deps).readiness.handler({})).toEqual({ open: 3, emailed: 2, resolved: 0 });
    const rows = await dbs.owner.select().from(opsAlert);
    const a1 = rows.find((r) => r.dedupeKey.endsWith(IDS.clientA1))!;
    expect(a1.emailedAt).toBeNull();
    expect(rows.filter((r) => r.emailedAt !== null)).toHaveLength(2);
    expect(err).toHaveBeenCalledWith({ alertId: a1.id, errors: ['Error'] }, '[brief-readiness] staff email failed');
  });

  it('no recipients: nothing marked emailed', async () => {
    vi.spyOn(workerLog, 'warn').mockImplementation(() => {});
    const { deps, send } = makeDeps({ recipients: [] });
    expect(await createOpsJobs(deps).readiness.handler({})).toEqual({ open: 3, emailed: 0, resolved: 0 });
    expect(send).not.toHaveBeenCalled();
    expect((await dbs.owner.select().from(opsAlert)).every((a) => a.emailedAt === null)).toBe(true);
  });
});
