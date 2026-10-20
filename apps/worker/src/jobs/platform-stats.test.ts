import { agency, agencyDailyStat } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { asc, eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createPlatformStatsJobs } from './platform-stats';
import { workerLog } from '../log';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
afterEach(() => vi.restoreAllMocks());

const deps = { serviceDb: () => dbs.service } as unknown as WorkerDeps;
const days = async () =>
  (await dbs.owner.select({ day: agencyDailyStat.day }).from(agencyDailyStat).where(eq(agencyDailyStat.agencyId, IDS.agencyA)).orderBy(asc(agencyDailyStat.day))).map((r) => r.day);

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('platform-daily-stats', () => {
  it('declares name, 02:00 UTC cron and payload schema', () => {
    const { daily } = createPlatformStatsJobs(deps);
    expect(daily).toMatchObject({ name: 'platform-daily-stats', cron: '0 2 * * *' });
    expect(daily.schema.safeParse({}).success).toBe(true);
    expect(daily.schema.safeParse({ day: '2026-10-01', backfill: true }).success).toBe(true);
    expect(daily.schema.safeParse({ backfill: 'yes' }).success).toBe(false);
  });

  it('computes yesterday (UTC) for every agency, backfilling when the table is empty; re-runs are idempotent', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-13T02:00:00Z'));
    try {
      await dbs.owner.update(agency).set({ createdAt: new Date('2026-10-09T08:00:00Z') });
      const log = vi.spyOn(workerLog, 'info').mockImplementation(() => {});
      const { daily } = createPlatformStatsJobs(deps);
      expect(await daily.handler({})).toEqual({ agencies: 2, days: 4 });
      expect(await days()).toEqual(['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12']);
      expect(await daily.handler({})).toEqual({ agencies: 2, days: 1 });
      expect(await days()).toHaveLength(4);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('[platform-daily-stats]'));
      log.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('{ day } recomputes one day', async () => {
    await dbs.owner.update(agency).set({ createdAt: new Date('2026-01-01T00:00:00Z') });
    const { daily } = createPlatformStatsJobs(deps);
    vi.spyOn(workerLog, 'info').mockImplementation(() => {});
    expect(await daily.handler({ day: '2026-03-04' })).toEqual({ agencies: 2, days: 1 });
    expect(await days()).toEqual(['2026-03-04']);
  });
});
