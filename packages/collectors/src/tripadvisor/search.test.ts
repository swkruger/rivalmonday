import { capture, client, clientCompetitor, competitor, competitorSource, observation, vendorTask } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { claimDueSources } from '../sources/due';
import { ensureCompetitorSources } from '../sources/ensure';
import { VendorError } from '../vendors/errors';
import fixture from './__fixtures__/tripadvisor-search.json';
import { TRIPADVISOR_KIND, collectReadyTripadvisor, postTripadvisorTasks, syncTripadvisorSources } from './search';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = (async (v: string) => ({ tripadvisor: v === 'venues_attractions' })) as unknown as Parameters<typeof syncTripadvisorSources>[1];
const TASK = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const fixtureResult = fixture.tasks[0]!.result as unknown[];
const taRows = () => dbs.owner.select().from(competitorSource).where(eq(competitorSource.source, TRIPADVISOR_KIND));
const activeOf = async () => Object.fromEntries((await taRows()).map((r) => [r.competitorId, r.active]));

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  // A1 becomes the venues client in Dripping Springs; X is shared with B1 (hvac); Y is only tracked by A2 (dental).
  await dbs.owner.update(client).set({ verticalId: 'venues_attractions', address: { city: 'Dripping Springs' } as never }).where(eq(client.id, IDS.clientA1));
  await dbs.owner.update(competitor).set({ name: 'Treaty Oak Distilling' }).where(eq(competitor.id, IDS.competitorX));
});

describe('syncTripadvisorSources', () => {
  it('activates rows for an opted-in client rival and self, none for competitors only a non-venues client tracks', async () => {
    const [self] = await dbs.owner.insert(competitor).values({ name: 'Self Venue' }).returning();
    await dbs.owner.update(client).set({ selfCompetitorId: self!.id }).where(eq(client.id, IDS.clientA1));
    expect(await syncTripadvisorSources(dbs.service, packs)).toEqual({ active: 2, inactive: 0 });
    expect(await activeOf()).toEqual({ [IDS.competitorX]: true, [self!.id]: true });
  });

  it('deactivates a row once the venues client drops the rival, and reactivates it when re-added', async () => {
    await syncTripadvisorSources(dbs.service, packs);
    await dbs.owner.delete(clientCompetitor).where(and(eq(clientCompetitor.clientId, IDS.clientA1), eq(clientCompetitor.competitorId, IDS.competitorX)));
    expect(await syncTripadvisorSources(dbs.service, packs)).toEqual({ active: 0, inactive: 1 });
    expect(await activeOf()).toEqual({ [IDS.competitorX]: false });
    await dbs.owner.insert(clientCompetitor).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: IDS.competitorX });
    await syncTripadvisorSources(dbs.service, packs);
    expect(await activeOf()).toEqual({ [IDS.competitorX]: true });
  });

  it('ensureCompetitorSources adds no tripadvisor row', async () => {
    await ensureCompetitorSources(dbs.service, IDS.competitorY);
    expect(await taRows()).toEqual([]);
    expect((await dbs.owner.select().from(competitorSource).where(eq(competitorSource.competitorId, IDS.competitorY))).length).toBe(6);
  });

  it('a claim skips a tripadvisor row once the sync deactivated it for a competitor only an hvac client tracks', async () => {
    await dbs.owner.delete(clientCompetitor).where(and(eq(clientCompetitor.clientId, IDS.clientA1), eq(clientCompetitor.competitorId, IDS.competitorX)));
    await dbs.service.insert(competitorSource).values({ competitorId: IDS.competitorX, source: TRIPADVISOR_KIND });
    await syncTripadvisorSources(dbs.service, packs);
    expect((await claimDueSources(dbs.service, 50)).filter((c) => c.source === TRIPADVISOR_KIND)).toEqual([]);
  });

  it('a claim offers the tripadvisor row of an opted-in rival', async () => {
    await syncTripadvisorSources(dbs.service, packs);
    expect((await claimDueSources(dbs.service, 50)).filter((c) => c.source === TRIPADVISOR_KIND)).toEqual([{ competitorId: IDS.competitorX, source: TRIPADVISOR_KIND }]);
  });
});

describe('postTripadvisorTasks', () => {
  it('posts "<name> <city>" tagged with the competitor id and records vendor_task rows', async () => {
    const dfs = fakeDfs(() => [dfsTask([], { id: TASK, statusCode: 20100, tag: IDS.competitorX })]);
    const r = await postTripadvisorTasks({ db: dbs.service, dfs }, [IDS.competitorX]);
    expect(r).toEqual({ posted: 1, postedIds: [IDS.competitorX], failedIds: [] });
    expect(dfs.calls[0]?.path).toBe('/business_data/tripadvisor/search/task_post');
    expect(dfs.calls[0]?.body).toEqual([{ keyword: 'Treaty Oak Distilling Dripping Springs', location_name: 'United States', language_code: 'en', tag: IDS.competitorX }]);
    expect(dfs.calls[0]?.scope).toMatchObject({ competitorIds: [IDS.competitorX] });
    expect((await dbs.service.select().from(vendorTask)).map((v) => v.kind)).toEqual(['tripadvisor']);
  });

  it('chunks the post and puts a failed chunk in failedIds without losing the posted one', async () => {
    let n = 0;
    const dfs = fakeDfs((_m, _p, body) => {
      if (n++ === 1) throw new VendorError('dataforseo', 429, 'rate', true);
      return body!.map((b, i) => dfsTask([], { id: `cccccccc-cccc-4ccc-8ccc-00000000000${i}`, statusCode: 20100, tag: String(b.tag) }));
    });
    const r = await postTripadvisorTasks({ db: dbs.service, dfs }, [IDS.competitorX, IDS.competitorY], 1);
    expect(dfs.calls).toHaveLength(2);
    expect(r.posted).toBe(1);
    expect(r.postedIds).toHaveLength(1);
    expect(r.failedIds).toHaveLength(1);
  });

  it('uses the GBP address city of a rival before the client city', async () => {
    const cap = await dbs.owner.insert(capture).values({ competitorId: IDS.competitorX, source: 'google_business_profile', status: 'ok', collectorVersion: 't' }).returning();
    await dbs.owner.insert(observation).values({ competitorId: IDS.competitorX, captureId: cap[0]!.id, kind: 'gbp_profile', key: 'profile', data: { address: '1 Main St, Austin, TX 78701, USA' } });
    const dfs = fakeDfs(() => [dfsTask([], { id: TASK, statusCode: 20100, tag: IDS.competitorX })]);
    await postTripadvisorTasks({ db: dbs.service, dfs }, [IDS.competitorX]);
    expect(dfs.calls[0]?.body?.[0]?.keyword).toBe('Treaty Oak Distilling Austin');
  });
});

describe('collectReadyTripadvisor', () => {
  const readyDfs = (result: unknown[]) => fakeDfs((_m, path) => (path.endsWith('/tasks_ready') ? [dfsTask([{ id: TASK }])] : [dfsTask(result, { id: TASK })]));
  const run = async (result: unknown[], competitorId: string = IDS.competitorX) => {
    await dbs.service.insert(vendorTask).values({ vendor: 'dataforseo', kind: TRIPADVISOR_KIND, externalTaskId: TASK, competitorId });
    const dfs = readyDfs(result);
    return { dfs, r: await collectReadyTripadvisor({ db: dbs.service, store: createMemoryStore(), dfs }) };
  };
  const compRow = async () => (await dbs.owner.select().from(competitor).where(eq(competitor.id, IDS.competitorX)))[0]!;
  const obsRows = () => dbs.owner.select().from(observation).where(eq(observation.kind, TRIPADVISOR_KIND));

  it('one match stores id/url and one observation (4.4 / 113)', async () => {
    const { dfs, r } = await run(fixtureResult);
    expect(r).toEqual({ collected: 1, failed: 0, matched: 1 });
    expect(dfs.calls[0]?.path).toBe('/business_data/tripadvisor/search/tasks_ready');
    expect(dfs.calls[1]?.path).toBe(`/business_data/tripadvisor/search/task_get/${TASK}`);
    expect(await compRow()).toMatchObject({ tripadvisorId: 'd11750497', tripadvisorUrl: expect.stringContaining('Dripping_Springs_Texas.html') });
    const obs = await obsRows();
    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({ key: 'rating', data: { id: 'd11750497', title: 'Treaty Oak Distilling', rating: 4.4, reviews: 113 } });
    const caps = await dbs.owner.select().from(capture).where(eq(capture.source, TRIPADVISOR_KIND));
    expect(caps).toHaveLength(1);
  });

  it('RF4: no match stores no observation and no id', async () => {
    await dbs.owner.update(competitor).set({ name: 'Unrelated Brewery' }).where(eq(competitor.id, IDS.competitorX));
    const { r } = await run(fixtureResult);
    expect(r).toEqual({ collected: 1, failed: 0, matched: 0 });
    expect(await obsRows()).toEqual([]);
    expect((await compRow()).tripadvisorId).toBeNull();
  });

  it('RF4: a stored id absent from the results stores no observation and keeps the id', async () => {
    await dbs.owner.update(competitor).set({ tripadvisorId: 'd99999', tripadvisorUrl: 'https://www.tripadvisor.com/x' }).where(eq(competitor.id, IDS.competitorX));
    const { r } = await run(fixtureResult);
    expect(r.matched).toBe(0);
    expect(await obsRows()).toEqual([]);
    expect(await compRow()).toMatchObject({ tripadvisorId: 'd99999', tripadvisorUrl: 'https://www.tripadvisor.com/x' });
  });

  it('a stored id is picked even when the name no longer matches', async () => {
    await dbs.owner.update(competitor).set({ name: 'Renamed Co', tripadvisorId: 'd14567890' }).where(eq(competitor.id, IDS.competitorX));
    const { r } = await run(fixtureResult);
    expect(r.matched).toBe(1);
    expect((await obsRows())[0]?.data).toMatchObject({ id: 'd14567890', rating: 4.6, reviews: 208 });
  });
});
