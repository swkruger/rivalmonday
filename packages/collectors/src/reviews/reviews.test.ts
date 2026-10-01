import { evidence, review, vendorTask } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { VendorError } from '../vendors/errors';
import { collectReadyReviews, collectReadyTasks } from './collect';
import { postReviewTasks } from './post';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});
const TASK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('review tasks', () => {
  it('posts one task per competitor and records it as pending', async () => {
    const dfs = fakeDfs(() => [dfsTask([], { id: TASK, statusCode: 20100, statusMessage: 'Task Created.' })]);
    expect(await postReviewTasks({ db: dbs.service, dfs }, [{ id: IDS.competitorX, placeId: 'p1', cid: null, backfill: true }])).toEqual({
      posted: 1, postedIds: [IDS.competitorX], failedIds: [],
    });
    expect(dfs.calls[0]?.body).toEqual([{ place_id: 'p1', location_code: 2840, language_code: 'en', depth: 700, sort_by: 'newest', tag: IDS.competitorX }]);
    const [vt] = await dbs.service.select().from(vendorTask);
    expect(vt).toMatchObject({ externalTaskId: TASK, kind: 'google_reviews', status: 'pending', competitorId: IDS.competitorX });
  });

  it('maps posted tasks to competitors by their echoed tag, not by response position', async () => {
    const T2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const dfs = fakeDfs(() => [
      dfsTask([], { id: T2, statusCode: 20100, tag: IDS.competitorY }),
      dfsTask([], { id: TASK, statusCode: 20100, tag: IDS.competitorX }),
    ]);
    const r = await postReviewTasks({ db: dbs.service, dfs }, [{ id: IDS.competitorX, placeId: 'p1', cid: null }, { id: IDS.competitorY, placeId: 'p2', cid: null }]);
    expect(r.postedIds.sort()).toEqual([IDS.competitorX, IDS.competitorY].sort());
    const rows = await dbs.service.select().from(vendorTask);
    expect(rows.find((v) => v.externalTaskId === TASK)?.competitorId).toBe(IDS.competitorX);
    expect(rows.find((v) => v.externalTaskId === T2)?.competitorId).toBe(IDS.competitorY);
  });

  it('ignores a task whose tag is not in the posted batch, and falls back to position only when tags are absent', async () => {
    const T2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const dfsForeign = fakeDfs(() => [dfsTask([], { id: TASK, statusCode: 20100, tag: '00000000-0000-4000-8000-00000000dead' })]);
    expect(await postReviewTasks({ db: dbs.service, dfs: dfsForeign }, [{ id: IDS.competitorX, placeId: 'p1', cid: null }])).toEqual({ posted: 0, postedIds: [], failedIds: [] });
    const dfs = fakeDfs(() => [dfsTask([], { id: TASK, statusCode: 20100 }), dfsTask([], { id: T2, statusCode: 20100 })]);
    await postReviewTasks({ db: dbs.service, dfs }, [{ id: IDS.competitorX, placeId: 'p1', cid: null }, { id: IDS.competitorY, placeId: 'p2', cid: null }]);
    const rows = await dbs.service.select().from(vendorTask);
    expect(rows.find((v) => v.externalTaskId === TASK)?.competitorId).toBe(IDS.competitorX);
    expect(rows.find((v) => v.externalTaskId === T2)?.competitorId).toBe(IDS.competitorY);
  });

  it('keeps earlier chunks posted when a later chunk fails with a VendorError, instead of losing them', async () => {
    let call = 0;
    const dfs = fakeDfs(() => {
      call++;
      if (call === 2) throw new VendorError('dataforseo', 50000, 'internal error', true);
      return [dfsTask([], { id: TASK, statusCode: 20100, statusMessage: 'Task Created.' })];
    });
    const r = await postReviewTasks(
      { db: dbs.service, dfs },
      [
        { id: IDS.competitorX, placeId: 'p1', cid: null },
        { id: IDS.competitorY, placeId: 'p2', cid: null },
      ],
      1, // one competitor per chunk, so chunk 2 is the one that throws
    );
    expect(r).toEqual({ posted: 1, postedIds: [IDS.competitorX], failedIds: [IDS.competitorY] });
    const rows = await dbs.service.select().from(vendorTask);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ competitorId: IDS.competitorX });
  });

  it('collects ready tasks into reviews and marks them done', async () => {
    await dbs.service.insert(vendorTask).values({ vendor: 'dataforseo', kind: 'google_reviews', externalTaskId: TASK, competitorId: IDS.competitorX });
    const dfs = fakeDfs((_m, path) => {
      if (path.endsWith('/tasks_ready')) return [dfsTask([{ id: TASK, tag: IDS.competitorX }, { id: 'unknown-task' }])];
      return [dfsTask([{ items: [{ review_id: 'r1', rating: { value: 5 }, review_text: 'Great', timestamp: '2026-09-20 10:00:00 +00:00', profile_name: 'A' }] }], { id: TASK })];
    });
    const r = await collectReadyReviews({ db: dbs.service, store: createMemoryStore(), dfs, salt: 's'.repeat(32) });
    expect(r).toEqual({ collected: 1, failed: 0, reviews: 1 });
    expect(dfs.calls.map((c) => c.path)).toEqual(['/business_data/google/reviews/tasks_ready', `/business_data/google/reviews/task_get/${TASK}`]);
    expect(await dbs.service.select().from(review)).toHaveLength(1);
    const [vt] = await dbs.service.select().from(vendorTask).where(eq(vendorTask.externalTaskId, TASK));
    expect(vt?.status).toBe('done');
  });

  it('never stores reviewer identity or review photos in the raw evidence payload (privacy at ingest, spec §4.5)', async () => {
    await dbs.service.insert(vendorTask).values({ vendor: 'dataforseo', kind: 'google_reviews', externalTaskId: TASK, competitorId: IDS.competitorX });
    const store = createMemoryStore();
    const dfs = fakeDfs((_m, path) => {
      if (path.endsWith('/tasks_ready')) return [dfsTask([{ id: TASK, tag: IDS.competitorX }])];
      return [
        dfsTask(
          [
            {
              items: [
                {
                  review_id: 'r1', rating: { value: 4 }, review_text: 'Call me at 404-555-0199', timestamp: '2026-09-20 10:00:00 +00:00',
                  profile_name: 'Jane Doe', profile_url: 'https://maps.google.com/contrib/1', profile_image_url: 'https://x/img.jpg',
                  original_review_text: 'Escríbeme a ana@x.com o al +34 612 345 678',
                  images: [{ type: 'image', alt: 'photo', url: 'https://lh5.googleusercontent.com/review-photo-1', image_url: 'https://lh5.googleusercontent.com/review-photo-2' }],
                },
              ],
            },
          ],
          { id: TASK },
        ),
      ];
    });
    const r = await collectReadyReviews({ db: dbs.service, store, dfs, salt: 's'.repeat(32) });
    expect(r).toEqual({ collected: 1, failed: 0, reviews: 1 });

    const [ev] = await dbs.service.select().from(evidence).where(eq(evidence.kind, 'vendor_json'));
    expect(ev?.objectKey).toBeTruthy();
    const stored = await store.get(ev?.objectKey as string);
    expect(stored).not.toBeNull();
    const json = gunzipSync(Buffer.from(stored as Uint8Array)).toString('utf8');
    expect(json).not.toMatch(/Jane/);
    expect(json).not.toMatch(/contrib\/1/);
    expect(json).not.toMatch(/img\.jpg/);
    expect(json).not.toMatch(/404.?555.?0199/);
    expect(json).not.toMatch(/ana@x\.com/);
    expect(json).not.toMatch(/612.?345.?678/);
    expect(json).not.toMatch(/review-photo/);
    expect(json).toMatch(/reviewer_hash/);
  });

  it('still fetches a task that only becomes ready after 48h, expiring only the ones that stay unready', async () => {
    const postedAt = new Date(Date.now() - 49 * 3600 * 1000);
    const STALE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await dbs.service.insert(vendorTask).values([
      { vendor: 'dataforseo', kind: 'google_reviews', externalTaskId: TASK, competitorId: IDS.competitorX, postedAt },
      { vendor: 'dataforseo', kind: 'google_reviews', externalTaskId: STALE, competitorId: IDS.competitorX, postedAt },
    ]);
    const dfs = fakeDfs((_m, path) => {
      if (path.endsWith('/tasks_ready')) return [dfsTask([{ id: TASK, tag: IDS.competitorX }])];
      return [dfsTask([{ items: [] }], { id: TASK })];
    });
    const r = await collectReadyTasks(
      { db: dbs.service, dfs },
      'google_reviews',
      '/business_data/google/reviews/tasks_ready',
      (id) => `/business_data/google/reviews/task_get/${id}`,
      async () => {},
    );
    expect(r.collected).toBe(1);
    const rows = await dbs.service.select().from(vendorTask);
    expect(rows.find((v) => v.externalTaskId === TASK)?.status).toBe('done');
    expect(rows.find((v) => v.externalTaskId === STALE)?.status).toBe('failed');
  });

  it('leaves a task pending on a retryable VendorError, but marks it failed on a non-retryable one', async () => {
    const T2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await dbs.service.insert(vendorTask).values([
      { vendor: 'dataforseo', kind: 'google_reviews', externalTaskId: TASK, competitorId: IDS.competitorX },
      { vendor: 'dataforseo', kind: 'google_reviews', externalTaskId: T2, competitorId: IDS.competitorY },
    ]);
    const dfs = fakeDfs((_m, path) => {
      if (path.endsWith('/tasks_ready')) return [dfsTask([{ id: TASK }, { id: T2 }])];
      if (path.endsWith(TASK)) throw new VendorError('dataforseo', 40202, 'Rate limit', true);
      throw new VendorError('dataforseo', 40501, 'Invalid field', false);
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const r = await collectReadyTasks({ db: dbs.service, dfs }, 'google_reviews', '/business_data/google/reviews/tasks_ready', (id) => `/business_data/google/reviews/task_get/${id}`, async () => {});
      expect(r).toEqual({ collected: 0, failed: 1 });
    } finally {
      warn.mockRestore();
    }
    const rows = await dbs.service.select().from(vendorTask);
    expect(rows.find((v) => v.externalTaskId === TASK)).toMatchObject({ status: 'pending', completedAt: null });
    expect(rows.find((v) => v.externalTaskId === T2)).toMatchObject({ status: 'failed', error: 'Invalid field' });
  });

  it('leaves a task pending when task_get carries a retryable task-level status code (50xxx)', async () => {
    await dbs.service.insert(vendorTask).values({ vendor: 'dataforseo', kind: 'google_reviews', externalTaskId: TASK, competitorId: IDS.competitorX });
    const dfs = fakeDfs((_m, path) => (path.endsWith('/tasks_ready') ? [dfsTask([{ id: TASK }])] : [dfsTask([], { id: TASK, statusCode: 50000, statusMessage: 'Internal Error.' })]));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(await collectReadyTasks({ db: dbs.service, dfs }, 'google_reviews', '/business_data/google/reviews/tasks_ready', (id) => `/business_data/google/reviews/task_get/${id}`, async () => {})).toEqual({ collected: 0, failed: 0 });
    } finally {
      warn.mockRestore();
    }
    const [row] = await dbs.service.select().from(vendorTask);
    expect(row).toMatchObject({ status: 'pending' });
  });
});
