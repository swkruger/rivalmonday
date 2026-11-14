import { client, competitorSource, socialAccount } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScClient } from './client';
import { runSocialDiscover, runSocialPull } from './run';
import { SOCIAL_KIND } from './sources';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const packs = (async (v: string) => ({ social: v === 'venues_attractions' })) as unknown as Parameters<typeof runSocialDiscover>[0]['packs'];
const comp = { id: IDS.competitorX, name: 'Rival', domain: null, metaPageIds: [] };
const sc = {} as ScClient;
const src = async () => (await dbs.owner.select().from(competitorSource).where(eq(competitorSource.source, SOCIAL_KIND)))[0]!;
const deps = (o: Partial<Parameters<typeof runSocialPull>[0]> = {}) => ({
  db: dbs.service, store: createMemoryStore(), sc,
  discover: vi.fn(async () => ({ credits: 2 })) as never,
  pull: vi.fn(async () => ({ captures: ['c'], credits: 3 })) as never,
  ...o,
});

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(client).set({ verticalId: 'venues_attractions' }).where(eq(client.id, IDS.clientA1));
  await dbs.owner.insert(competitorSource).values({ competitorId: IDS.competitorX, source: SOCIAL_KIND });
});

describe('runSocialPull', () => {
  it('missing key leaves last_run_at null and does not mark', async () => {
    const d = deps({ sc: null });
    expect(await runSocialPull(d, comp)).toMatchObject({ status: 'skipped' });
    expect(d.discover).not.toHaveBeenCalled();
    expect(d.pull).not.toHaveBeenCalled();
    const r = await src();
    expect(r.lastRunAt).toBeNull();
    expect(r.lastStatus).toBe('no_api_key');
    expect(r.nextDueAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('first pull discovers then pulls; second pull does not rediscover', async () => {
    const order: string[] = [];
    const d = deps({
      discover: vi.fn(async () => { order.push('discover'); return { credits: 2 }; }) as never,
      pull: vi.fn(async () => { order.push('pull'); return { captures: [], credits: 0 }; }) as never,
    });
    await runSocialPull(d, comp);
    expect(order).toEqual(['discover', 'pull']);
    expect((await src()).lastRunAt).not.toBeNull();
    await runSocialPull(d, comp);
    expect(order).toEqual(['discover', 'pull', 'pull']);
  });

  it('does not discover when the competitor already has accounts', async () => {
    await dbs.owner.insert(socialAccount).values({ competitorId: IDS.competitorX, network: 'facebook', handle: 'x', url: 'https://www.facebook.com/x', status: 'rejected' } as never);
    const d = deps();
    await runSocialPull(d, comp);
    expect(d.discover).not.toHaveBeenCalled();
    expect(d.pull).toHaveBeenCalled();
  });

  it('a discovery that fails after a vendor call marks error and skips the pull; before any call it rethrows', async () => {
    const failing = deps({ discover: (async (_db: unknown, c: ScClient) => { await c.searchCompanies('x'); }) as never, sc: { searchCompanies: async () => { throw new Error('vendor'); } } as unknown as ScClient });
    expect(await runSocialPull(failing, comp)).toMatchObject({ status: 'error' });
    expect(failing.pull).not.toHaveBeenCalled();
    const r = await src();
    expect(r.lastStatus).toBe('error');
    expect(r.lastRunAt).not.toBeNull();
    await dbs.owner.update(competitorSource).set({ lastRunAt: null });
    await expect(runSocialPull(deps({ discover: (async () => { throw new Error('db'); }) as never }), comp)).rejects.toThrow('db');
  });
});

describe('runSocialDiscover', () => {
  it('discover job skips when no eligible client', async () => {
    await dbs.owner.update(client).set({ verticalId: 'hvac' }).where(eq(client.id, IDS.clientA1));
    const discover = vi.fn();
    expect(await runSocialDiscover({ db: dbs.service, sc, packs, discover: discover as never }, comp)).toEqual({ status: 'skipped', reason: 'no_eligible_client' });
    expect(discover).not.toHaveBeenCalled();
  });

  it('discovers for an eligible competitor', async () => {
    const discover = vi.fn(async () => ({ credits: 2 }));
    expect(await runSocialDiscover({ db: dbs.service, sc, packs, discover: discover as never }, comp)).toMatchObject({ status: 'ok', credits: 2 });
  });
});
