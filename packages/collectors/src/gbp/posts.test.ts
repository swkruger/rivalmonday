import { capture, gbpPost, observation, vendorTask } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import fixture from './__fixtures__/posts-task-get.json';
import { GBP_POSTS_URL, collectReadyGbpPosts, parseGbpPost, postGbpPostTasks } from './posts';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});
const TASK = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TASK2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const fixtureItems = (fixture.tasks[0]!.result[0] as { items: unknown[] }).items;
const post = (n: number) => ({ type: 'google_business_post', post_text: `Post ${n}`, url: `https://search.google.com/local/posts?lpsid=ID${n}&x=1`, timestamp: '2026-11-01 00:00:00 +00:00', links: [] });

describe('parseGbpPost', () => {
  it('reads the fixture item: lpsid id, text, postedAt, buttonUrl', () => {
    const p = parseGbpPost(fixtureItems[0]);
    expect(p).toMatchObject({ postId: 'CIHM0ogKEICAgMDonPqBfQ', postedAt: '2025-04-22T00:00:00.000Z', buttonUrl: 'https://www.rustybrick.com/jobs' });
    expect(p?.text).toContain("We're hiring");
  });
  it('hashes the url when it has no lpsid', () => {
    const p = parseGbpPost({ post_text: 'Hi', url: 'https://example.com/p/1' });
    expect(p?.postId).toMatch(/^[0-9a-f]{32}$/);
    expect(parseGbpPost({ post_text: 'Other', url: 'https://example.com/p/1' })?.postId).toBe(p?.postId);
  });
  it('returns null with no id and no text', () => {
    expect(parseGbpPost({ type: 'google_business_post' })).toBeNull();
    expect(parseGbpPost(null)).toBeNull();
  });
});

describe('postGbpPostTasks', () => {
  it('sends tag and place/cid keywords, skips competitors without either, records vendor_task', async () => {
    const dfs = fakeDfs(() => [dfsTask([], { id: TASK, statusCode: 20100, tag: IDS.competitorX }), dfsTask([], { id: TASK2, statusCode: 20100, tag: IDS.competitorY })]);
    const r = await postGbpPostTasks({ db: dbs.service, dfs }, [
      { id: IDS.competitorX, placeId: 'ChIJabc', cid: '123' },
      { id: IDS.competitorY, placeId: null, cid: '456' },
      { id: '00000000-0000-4000-8000-000000000099', placeId: null, cid: null },
    ]);
    expect(r).toEqual({ posted: 2, postedIds: [IDS.competitorX, IDS.competitorY], failedIds: [] });
    expect(dfs.calls[0]?.path).toBe('/business_data/google/my_business_updates/task_post');
    expect(dfs.calls[0]?.body).toEqual([
      { keyword: 'place_id:ChIJabc', location_code: 2840, language_code: 'en', depth: 20, tag: IDS.competitorX },
      { keyword: 'cid:456', location_code: 2840, language_code: 'en', depth: 20, tag: IDS.competitorY },
    ]);
    const rows = await dbs.service.select().from(vendorTask);
    expect(rows.map((v) => v.kind)).toEqual(['google_posts', 'google_posts']);
  });
});

describe('collectReadyGbpPosts', () => {
  const readyDfs = (taskId: string, items: unknown[] | null) =>
    fakeDfs((_m, path) =>
      path.endsWith('/tasks_ready')
        ? [dfsTask([{ id: taskId }])]
        : items === null
          ? [dfsTask(null, { id: taskId, statusCode: 40102, statusMessage: 'No Search Results.' })]
          : [dfsTask([{ items }], { id: taskId })],
    );
  const run = async (taskId: string, items: unknown[] | null) => {
    await dbs.service.insert(vendorTask).values({ vendor: 'dataforseo', kind: 'google_posts', externalTaskId: taskId, competitorId: IDS.competitorX });
    return collectReadyGbpPosts({ db: dbs.service, store: createMemoryStore(), dfs: readyDfs(taskId, items) });
  };

  it('writes one capture, observations and gbp_post rows', async () => {
    const dfs = readyDfs(TASK, [post(1), post(2)]);
    await dbs.service.insert(vendorTask).values({ vendor: 'dataforseo', kind: 'google_posts', externalTaskId: TASK, competitorId: IDS.competitorX });
    const r = await collectReadyGbpPosts({ db: dbs.service, store: createMemoryStore(), dfs });
    expect(r).toEqual({ collected: 1, failed: 0, posts: 2 });
    expect(dfs.calls[1]?.path).toBe(`/business_data/google/my_business_updates/task_get/${TASK}`);
    const caps = await dbs.service.select().from(capture).where(eq(capture.competitorId, IDS.competitorX));
    expect(caps).toHaveLength(1);
    expect(caps[0]).toMatchObject({ source: 'google_business_profile', url: GBP_POSTS_URL, status: 'ok' });
    const obs = await dbs.service.select().from(observation);
    expect(obs.map((o) => [o.kind, o.key]).sort()).toEqual([['gbp_post', 'ID1'], ['gbp_post', 'ID2']]);
    const rows = await dbs.service.select().from(gbpPost);
    expect(rows).toHaveLength(2);
    expect(rows.every((p) => p.endedAt === null && p.firstCaptureId === caps[0]!.id)).toBe(true);
  });

  it('a later capture missing a post ends it; a reappearing post clears the end', async () => {
    await run(TASK, [post(1), post(2)]);
    await run(TASK2, [post(1)]);
    let rows = await dbs.service.select().from(gbpPost);
    const byId = (id: string) => rows.find((p) => p.externalId === id)!;
    expect(byId('ID1').endedAt).toBeNull();
    expect(byId('ID2').endedAt).not.toBeNull();
    expect(byId('ID2').endedCaptureId).not.toBeNull();
    await run('dddddddd-dddd-4ddd-8ddd-dddddddddddd', [post(1), post(2)]);
    rows = await dbs.service.select().from(gbpPost);
    expect(byId('ID2').endedAt).toBeNull();
    expect(byId('ID2').endedCaptureId).toBeNull();
  });

  it('an empty (40102) capture ends none', async () => {
    await run(TASK, [post(1), post(2)]);
    const r = await run(TASK2, null);
    expect(r).toEqual({ collected: 1, failed: 0, posts: 0 });
    const rows = await dbs.service.select().from(gbpPost);
    expect(rows.every((p) => p.endedAt === null)).toBe(true);
    const caps = await dbs.service.select().from(capture).where(eq(capture.competitorId, IDS.competitorX));
    expect(caps).toHaveLength(2);
  });
});
