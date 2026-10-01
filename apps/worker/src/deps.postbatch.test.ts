import { competitor, competitorSource } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, testUrls, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkerDeps } from './deps';

// Exercises WorkerDeps.postBatchTasks end to end against the real test DB, with the network
// boundary (global fetch, which DataForSeoClient calls through) stubbed so no real DataForSEO
// call is made. This is the only way to prove reviews/jobs are resolved independently (ruling:
// a jobs-posting failure must never touch reviews' already-'posted' status) — that behavior lives
// entirely inside deps.ts's own postBatchTasks and isn't visible to a mocked-WorkerDeps test.
const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.service.update(competitor).set({ placeId: 'p1' }).where(eq(competitor.id, IDS.competitorX));
  // Seed both sources as already "claimed" (next_due_at advanced), like claimDueSources would
  // leave them mid-schedule-tick, so the test can show reviews staying claimed/posted while jobs
  // alone gets released back to due-now.
  await dbs.service.insert(competitorSource).values([
    { competitorId: IDS.competitorX, source: 'reviews', nextDueAt: sql`now() + interval '7 days'` },
    { competitorId: IDS.competitorX, source: 'jobs', nextDueAt: sql`now() + interval '7 days'` },
  ]);
});

const BASE_ENV = { SERVICE_DATABASE_URL: testUrls.service, DATAFORSEO_LOGIN: 'test-login', DATAFORSEO_PASSWORD: 'test-password' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WorkerDeps.postBatchTasks', () => {
  it('keeps reviews posted when the jobs batch fails with a VendorError, instead of releasing the whole batch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/business_data/google/reviews/task_post')) {
          return new Response(
            JSON.stringify({ status_code: 20000, status_message: 'Ok.', tasks: [{ id: 't1', status_code: 20100, status_message: 'Task Created.', result: [] }] }),
            { status: 200 },
          );
        }
        if (url.includes('/serp/google/jobs/task_post')) {
          return new Response('unauthorized', { status: 401 });
        }
        throw new Error(`unexpected fetch ${url}`);
      }),
    );
    const deps = createWorkerDeps({ ...BASE_ENV, REVIEWER_HASH_SALT: 's'.repeat(32) } as NodeJS.ProcessEnv);
    try {
      const r = await deps.postBatchTasks([
        { competitorId: IDS.competitorX, source: 'reviews' },
        { competitorId: IDS.competitorX, source: 'jobs' },
      ]);
      expect(r.failed).toBe(1);
      const rows = (await dbs.service.execute(
        sql`SELECT source, last_status, (next_due_at <= now()) AS due FROM competitor_source WHERE competitor_id = ${IDS.competitorX} ORDER BY source`,
      )) as unknown as { source: string; last_status: string; due: boolean }[];
      expect(rows.find((row) => row.source === 'reviews')).toMatchObject({ last_status: 'posted', due: false });
      expect(rows.find((row) => row.source === 'jobs')).toMatchObject({ last_status: 'post_failed', due: true });
    } finally {
      await deps.close();
    }
  });

  it('does not post review tasks without a usable REVIEWER_HASH_SALT (marks them skipped_no_salt), but still posts jobs', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/serp/google/jobs/task_post')) {
        return new Response(
          JSON.stringify({ status_code: 20000, status_message: 'Ok.', tasks: [{ id: 'j1', status_code: 20100, status_message: 'Task Created.', result: [] }] }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const deps = createWorkerDeps({ ...BASE_ENV, REVIEWER_HASH_SALT: 'short' } as NodeJS.ProcessEnv);
    try {
      const r = await deps.postBatchTasks([
        { competitorId: IDS.competitorX, source: 'reviews' },
        { competitorId: IDS.competitorX, source: 'jobs' },
      ]);
      await deps.postBatchTasks([{ competitorId: IDS.competitorX, source: 'reviews' }]);
      expect(r.failed).toBe(0);
      expect(fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('/reviews/'))).toEqual([]);
      const rows = (await dbs.service.execute(
        sql`SELECT source, last_status FROM competitor_source WHERE competitor_id = ${IDS.competitorX} ORDER BY source`,
      )) as unknown as { source: string; last_status: string }[];
      expect(rows.find((row) => row.source === 'reviews')?.last_status).toBe('skipped_no_salt');
      expect(rows.find((row) => row.source === 'jobs')?.last_status).toBe('posted');
      const vendorTasks = (await dbs.service.execute(sql`SELECT kind FROM vendor_task WHERE competitor_id = ${IDS.competitorX}`)) as unknown as { kind: string }[];
      expect(vendorTasks.map((t) => t.kind)).toEqual(['google_jobs']);
      // Logged once, not on every tick.
      expect(log.mock.calls.filter((c) => String(c[0]).includes('REVIEWER_HASH_SALT'))).toHaveLength(1);
    } finally {
      log.mockRestore();
      await deps.close();
    }
  });
});
