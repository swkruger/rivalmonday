import { agencyBilling, capture, client, competitor, competitorSource, observation } from '@cs/db';
import { IDS, openTestDbs, pauseAgency, pauseClient, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import type { Db } from '@cs/db';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureSelfCompetitor, ensureSelfCompetitors, fillSelfDomains } from './self';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const selfOf = async (clientId: string) => (await dbs.owner.select({ s: client.selfCompetitorId }).from(client).where(eq(client.id, clientId)))[0]?.s ?? null;

describe('ensureSelfCompetitor', () => {
  it('creates a competitor row for the client place, links it, and schedules GBP, reviews and Google ads', async () => {
    await dbs.owner.update(client).set({ placeId: 'place-a1' }).where(eq(client.id, IDS.clientA1));
    const r = await ensureSelfCompetitor(dbs.service, IDS.clientA1);
    expect(r).toMatchObject({ competitorId: expect.any(String) });
    const id = (r as { competitorId: string }).competitorId;
    expect(await selfOf(IDS.clientA1)).toBe(id);
    expect((await dbs.owner.select().from(competitor).where(eq(competitor.id, id)))[0]).toMatchObject({ name: 'A1 HVAC', placeId: 'place-a1', domain: null });
    expect((await dbs.owner.select({ s: competitorSource.source }).from(competitorSource).where(eq(competitorSource.competitorId, id))).map((x) => x.s).sort()).toEqual(['ads_google', 'gbp', 'reviews']);
    expect(await ensureSelfCompetitor(dbs.service, IDS.clientA1)).toEqual({ competitorId: id }); // idempotent
  });

  it('reuses an existing competitor with the same place id (the business is already tracked by someone)', async () => {
    await dbs.owner.update(competitor).set({ placeId: 'place-x' }).where(eq(competitor.id, IDS.competitorX));
    await dbs.owner.update(client).set({ placeId: 'place-x' }).where(eq(client.id, IDS.clientA2));
    expect(await ensureSelfCompetitor(dbs.service, IDS.clientA2)).toEqual({ competitorId: IDS.competitorX });
    expect(await selfOf(IDS.clientA2)).toBe(IDS.competitorX);
  });

  it('skips a client without a place id, and ensureSelfCompetitors links every eligible client once', async () => {
    expect(await ensureSelfCompetitor(dbs.service, IDS.clientB1)).toEqual({ skipped: 'client has no placeId' });
    await dbs.owner.update(client).set({ placeId: 'place-a1' }).where(eq(client.id, IDS.clientA1));
    expect(await ensureSelfCompetitors(dbs.service)).toBe(1);
    expect(await ensureSelfCompetitors(dbs.service)).toBe(0);
  });

  it('does not link a prospect’s own business on the schedule tick; an active client is still linked (5b-2 decision 9)', async () => {
    await dbs.owner.update(client).set({ placeId: 'ChIJactiveSelf01' }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.update(client).set({ status: 'prospect', placeId: 'ChIJprospectSelf02' }).where(eq(client.id, IDS.clientA2));
    expect(await ensureSelfCompetitors(dbs.service)).toBe(1);
    expect(await selfOf(IDS.clientA1)).not.toBeNull();
    expect(await selfOf(IDS.clientA2)).toBeNull();
  });

  it('does not link a read_only agency’s client; an agency with no billing row is still linked (9a)', async () => {
    await dbs.owner.update(client).set({ placeId: 'ChIJpausedA1' }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.update(client).set({ placeId: 'ChIJserviceB1' }).where(eq(client.id, IDS.clientB1));
    await pauseAgency(dbs.owner, IDS.agencyA);
    expect(await ensureSelfCompetitors(dbs.service)).toBe(1);
    expect(await selfOf(IDS.clientA1)).toBeNull();
    expect(await selfOf(IDS.clientB1)).not.toBeNull();
  });

  describe('self backfill sweep', () => {
    const sources = async (id: string) => (await dbs.owner.select({ s: competitorSource.source }).from(competitorSource).where(eq(competitorSource.competitorId, id))).map((x) => x.s).sort();
    async function linkedSelf(): Promise<string> {
      const [s] = await dbs.owner.insert(competitor).values({ name: 'A1 HVAC', placeId: 'place-a1' }).returning();
      await dbs.owner.update(client).set({ selfCompetitorId: s!.id, placeId: 'place-a1' }).where(eq(client.id, IDS.clientA1));
      await dbs.owner.insert(competitorSource).values([{ competitorId: s!.id, source: 'gbp' }, { competitorId: s!.id, source: 'reviews' }]);
      return s!.id;
    }
    async function gbp(id: string, data: Record<string, unknown>) {
      const [c] = await dbs.owner.insert(capture).values({ competitorId: id, source: 'google_business_profile', status: 'ok', collectorVersion: 't' }).returning();
      await dbs.owner.insert(observation).values({ competitorId: id, captureId: c!.id, kind: 'gbp_profile', key: 'profile', data });
    }
    const domainOf = async (id: string) => (await dbs.owner.select({ d: competitor.domain }).from(competitor).where(eq(competitor.id, id)))[0]!.d;

    it('adds ads_google to an already-linked self competitor, once', async () => {
      const id = await linkedSelf();
      await ensureSelfCompetitors(dbs.service);
      expect(await sources(id)).toEqual(['ads_google', 'gbp', 'reviews']);
      await ensureSelfCompetitors(dbs.service);
      expect(await sources(id)).toEqual(['ads_google', 'gbp', 'reviews']);
    });

    it('does not add ads_google for a read_only/suspended agency or a paused client; another client still gets it (9a/9b)', async () => {
      const a1 = await linkedSelf();
      const [b] = await dbs.owner.insert(competitor).values({ name: 'B1 HVAC', placeId: 'place-b1' }).returning();
      await dbs.owner.update(client).set({ selfCompetitorId: b!.id, placeId: 'place-b1' }).where(eq(client.id, IDS.clientB1));
      await pauseAgency(dbs.owner, IDS.agencyA);
      await ensureSelfCompetitors(dbs.service);
      expect(await sources(a1)).toEqual(['gbp', 'reviews']);
      expect(await sources(b!.id)).toEqual(['ads_google']);
      await pauseAgency(dbs.owner, IDS.agencyA, 'suspended');
      await ensureSelfCompetitors(dbs.service);
      expect(await sources(a1)).toEqual(['gbp', 'reviews']);
      await dbs.owner.delete(agencyBilling);
      await pauseClient(dbs.owner, IDS.clientA1);
      await ensureSelfCompetitors(dbs.service);
      expect(await sources(a1)).toEqual(['gbp', 'reviews']);
    });

    it('fills a null domain from the latest GBP observation (url normalised), idempotently', async () => {
      const id = await linkedSelf();
      await gbp(id, { domain: null, url: 'https://www.A1hvac.example/contact' });
      await ensureSelfCompetitors(dbs.service);
      expect(await domainOf(id)).toBe('a1hvac.example');
      await ensureSelfCompetitors(dbs.service);
      expect(await domainOf(id)).toBe('a1hvac.example');
    });

    it('leaves the domain null when another competitor owns it', async () => {
      const id = await linkedSelf();
      await gbp(id, { domain: 'smithhvac.example' }); // competitor X owns it
      await ensureSelfCompetitors(dbs.service);
      expect(await domainOf(id)).toBeNull();
    });
  });
});

describe('fillSelfDomains', () => {
  // A stubbed db: the select chain yields two rows; the UPDATE for the first throws a (drizzle-wrapped) unique violation.
  const stub = (executeImpl: (n: number) => Promise<unknown>) => {
    const rows = [{ id: 'c1', data: { domain: 'one.example.com' } }, { id: 'c2', data: { domain: 'two.example.com' } }];
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'innerJoin', 'where']) chain[m] = () => chain;
    chain.orderBy = () => Promise.resolve(rows);
    let n = 0;
    return { selectDistinctOn: () => chain, execute: () => executeImpl(++n) } as unknown as Db;
  };

  it('logs and continues when a domain update loses a race (23505), so the tick is not aborted', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const calls: number[] = [];
    await fillSelfDomains(stub(async (n) => { calls.push(n); if (n === 1) throw Object.assign(new Error('failed query'), { cause: { code: '23505' } }); }));
    expect(calls).toEqual([1, 2]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('rethrows any other database error', async () => {
    await expect(fillSelfDomains(stub(async () => { throw new Error('connection lost'); }))).rejects.toThrow('connection lost');
  });
});

describe('ensureSelfCompetitors and a paused client (9b)', () => {
  it('does not link a paused client own business; an unpaused client is still linked', async () => {
    await dbs.owner.update(client).set({ placeId: 'ChIJpausedA1' }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.update(client).set({ placeId: 'ChIJserviceB1' }).where(eq(client.id, IDS.clientB1));
    await pauseClient(dbs.owner, IDS.clientA1);
    expect(await ensureSelfCompetitors(dbs.service)).toBe(1);
    expect(await selfOf(IDS.clientA1)).toBeNull();
    expect(await selfOf(IDS.clientB1)).not.toBeNull();
  });
});
