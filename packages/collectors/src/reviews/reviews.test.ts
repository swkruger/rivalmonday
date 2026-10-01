import { evidence, review, vendorTask } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { collectReadyReviews } from './collect';
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
    expect(await postReviewTasks({ db: dbs.service, dfs }, [{ id: IDS.competitorX, placeId: 'p1', cid: null, backfill: true }])).toEqual({ posted: 1 });
    expect(dfs.calls[0]?.body).toEqual([{ place_id: 'p1', location_code: 2840, language_code: 'en', depth: 700, sort_by: 'newest', tag: IDS.competitorX }]);
    const [vt] = await dbs.service.select().from(vendorTask);
    expect(vt).toMatchObject({ externalTaskId: TASK, kind: 'google_reviews', status: 'pending', competitorId: IDS.competitorX });
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

  it('never stores reviewer identity in the raw evidence payload (privacy at ingest, spec §4.5)', async () => {
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
    expect(json).toMatch(/reviewer_hash/);
  });
});
