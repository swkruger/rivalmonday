import { client, competitorSource, socialAccount } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { claimDueSources, markSourceResult } from '../sources/due';
import { SOCIAL_KIND, syncSocialSources } from './sources';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = (async (v: string) => ({ social: v === 'venues_attractions' })) as unknown as Parameters<typeof syncSocialSources>[1];
const rows = () => dbs.owner.select().from(competitorSource).where(eq(competitorSource.source, SOCIAL_KIND));
const claimed = async () => (await claimDueSources(dbs.service, 50)).filter((c) => c.source === SOCIAL_KIND);

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  // A1 is the opted-in client (pack with social); competitor X is shared with B1 (hvac, pack without social).
  await dbs.owner.update(client).set({ verticalId: 'venues_attractions' }).where(eq(client.id, IDS.clientA1));
});

describe('syncSocialSources', () => {
  it('pack without social → no source', async () => {
    await dbs.owner.update(client).set({ verticalId: 'hvac' }).where(eq(client.id, IDS.clientA1));
    expect(await syncSocialSources(dbs.service, packs)).toEqual({ active: 0, inactive: 0, discover: [] });
    expect(await rows()).toEqual([]);
  });

  it('activates a row for an opted-in client rival and lists it for discovery', async () => {
    const r = await syncSocialSources(dbs.service, packs);
    expect(r).toMatchObject({ active: 1, inactive: 0, discover: [IDS.competitorX] });
    expect((await rows()).map((x) => [x.competitorId, x.active])).toEqual([[IDS.competitorX, true]]);
  });

  it('paused client only → no pull', async () => {
    await syncSocialSources(dbs.service, packs);
    await dbs.owner.update(client).set({ pausedAt: new Date() }).where(eq(client.id, IDS.clientA1));
    expect(await syncSocialSources(dbs.service, packs)).toMatchObject({ active: 0, inactive: 1, discover: [] });
    expect((await rows()).map((x) => x.active)).toEqual([false]);
    expect(await claimed()).toEqual([]);
  });

  it('discover lists a competitor once: not after a run is marked, nor when it has accounts', async () => {
    expect((await syncSocialSources(dbs.service, packs)).discover).toEqual([IDS.competitorX]);
    expect((await syncSocialSources(dbs.service, packs)).discover).toEqual([IDS.competitorX]);
    await markSourceResult(dbs.service, IDS.competitorX, SOCIAL_KIND, 'ok');
    expect((await syncSocialSources(dbs.service, packs)).discover).toEqual([]);
    await dbs.owner.update(competitorSource).set({ lastRunAt: null }).where(eq(competitorSource.source, SOCIAL_KIND));
    await dbs.owner.insert(socialAccount).values({ competitorId: IDS.competitorX, network: 'facebook', handle: 'x', url: 'https://www.facebook.com/x', status: 'rejected' } as never);
    expect((await syncSocialSources(dbs.service, packs)).discover).toEqual([]);
  });

  it('a claim offers the social row of an opted-in rival', async () => {
    await syncSocialSources(dbs.service, packs);
    expect(await claimed()).toEqual([{ competitorId: IDS.competitorX, source: SOCIAL_KIND }]);
  });

  it('a self business of an opted-in client is claimable', async () => {
    const [self] = await dbs.owner.execute(`INSERT INTO competitor (name) VALUES ('Self') RETURNING id`) as unknown as { id: string }[];
    await dbs.owner.update(client).set({ selfCompetitorId: self!.id }).where(eq(client.id, IDS.clientA1));
    await syncSocialSources(dbs.service, packs);
    expect((await claimed()).map((c) => c.competitorId)).toContain(self!.id);
  });
});
