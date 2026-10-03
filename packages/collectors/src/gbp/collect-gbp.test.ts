import { capture, client, competitor, observation } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { and, eq, ne } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { VendorError } from '../vendors/errors';
import { collectGbpProfile, extractGbpProfile, isUniqueViolation } from './collect-gbp';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const item = {
  type: 'google_business_info', title: 'Smith HVAC', category: 'HVAC contractor', additional_categories: ['Plumber'],
  rating: { value: 4.6, votes_count: 210 }, phone: '+14045550199', url: 'https://smithhvac.example/', domain: 'smithhvac.example',
  is_claimed: true, current_status: 'opened', cid: '111', place_id: 'p1', work_time: { work_hours: { timetable: {} } }, services: [{ name: 'AC tune-up' }],
};

describe('collectGbpProfile', () => {
  it('stores raw evidence and a gbp_profile observation, and learns the cid', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [item] }])]);
    const r = await collectGbpProfile({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, placeId: 'p1', cid: null });
    expect(r.status).toBe('ok');
    expect(dfs.calls[0]?.body).toEqual([{ keyword: 'place_id:p1', location_code: 2840, language_code: 'en' }]);
    const [o] = await dbs.service.select().from(observation).where(eq(observation.competitorId, IDS.competitorX));
    expect(o).toMatchObject({ kind: 'gbp_profile', key: 'profile' });
    expect(o?.data).toMatchObject({ title: 'Smith HVAC', rating: 4.6, votes: 210, isClaimed: true, additionalCategories: ['Plumber'] });
    const [c] = await dbs.service.select().from(competitor).where(eq(competitor.id, IDS.competitorX));
    expect(c?.cid).toBe('111');
  });

  it('skips competitors without place id or cid', async () => {
    expect(await collectGbpProfile({ db: dbs.service, store: createMemoryStore(), dfs: fakeDfs(() => []) }, { id: IDS.competitorX, placeId: null, cid: null })).toEqual({ status: 'skipped' });
  });

  it('records vendor errors as captures', async () => {
    const dfs = fakeDfs(() => { throw new VendorError('dataforseo', 40100, 'not authorized', false); });
    const r = await collectGbpProfile({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, placeId: 'p1', cid: null });
    expect(r.status).toBe('vendor_error');
  });

  it('records a vendor_error capture (never an empty ok capture) when the task itself failed inside an OK envelope', async () => {
    const dfs = fakeDfs(() => [dfsTask([], { statusCode: 40400, statusMessage: 'Not Found.' })]);
    const r = await collectGbpProfile({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, placeId: 'p1', cid: null });
    expect(r.status).toBe('vendor_error');
    const observations = await dbs.service.select().from(observation).where(eq(observation.competitorId, IDS.competitorX));
    expect(observations).toHaveLength(0);
    const [cap] = await dbs.service.select().from(capture).where(eq(capture.id, r.captureId as string));
    expect(cap).toMatchObject({ status: 'vendor_error', error: '40400 Not Found.' });
  });

  it('records a vendor_error capture when the envelope is OK but no task comes back', async () => {
    const dfs = fakeDfs(() => []);
    const r = await collectGbpProfile({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, placeId: 'p1', cid: null });
    expect(r.status).toBe('vendor_error');
    const [cap] = await dbs.service.select().from(capture).where(eq(capture.id, r.captureId as string));
    expect(cap).toMatchObject({ status: 'vendor_error', error: 'empty task' });
    const observations = await dbs.service.select().from(observation).where(eq(observation.competitorId, IDS.competitorX));
    expect(observations).toHaveLength(0);
  });

  it('warns and still stores the observation when another competitor already holds the learned cid', async () => {
    await dbs.service.update(competitor).set({ cid: '111' }).where(eq(competitor.id, IDS.competitorY));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const dfs = fakeDfs(() => [dfsTask([{ items: [item] }])]);
    const r = await collectGbpProfile({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, placeId: 'p1', cid: null });
    expect(r.status).toBe('ok');
    const [o] = await dbs.service.select().from(observation).where(eq(observation.competitorId, IDS.competitorX));
    expect(o).toMatchObject({ kind: 'gbp_profile', key: 'profile' });
    const [cx] = await dbs.service.select().from(competitor).where(eq(competitor.id, IDS.competitorX));
    expect(cx?.cid).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('isUniqueViolation', () => {
  it('is true for a Drizzle-wrapped unique violation (code on cause)', () => {
    expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true);
  });

  it('is true for a raw driver unique violation (code on the error itself)', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
  });

  it('is false for an unrelated error', () => {
    expect(isUniqueViolation(new Error('connection reset'))).toBe(false);
  });
});

it('keeps the business address in the GBP profile (new-location signal, Phase 3b)', () => {
  expect(extractGbpProfile({ title: 'Smith HVAC', address: '5387 Hwy 6 Ste 101, Woodway, TX 76712' })?.address).toBe('5387 Hwy 6 Ste 101, Woodway, TX 76712');
  expect(extractGbpProfile({ title: 'Smith HVAC' })?.address).toBeNull();
});

describe('self business naming from GBP', () => {
  it('names a self business from its public GBP title, never from a client name (3c carry-over)', async () => {
    await dbs.owner.update(client).set({ selfCompetitorId: IDS.competitorX }).where(eq(client.id, IDS.clientA2));
    await dbs.owner.update(competitor).set({ name: 'A2 private client name' }).where(eq(competitor.id, IDS.competitorX));
    const dfs = fakeDfs(() => [dfsTask([{ items: [{ ...item, title: 'Smith Heating & Air' }] }])]);
    await collectGbpProfile({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, placeId: 'p1', cid: null });
    expect((await dbs.owner.select().from(competitor).where(eq(competitor.id, IDS.competitorX)))[0]?.name).toBe('Smith Heating & Air');
  });

  it('leaves the name of an ordinary competitor alone', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [{ ...item, title: 'Smith Heating & Air' }] }])]);
    await collectGbpProfile({ db: dbs.service, store: createMemoryStore(), dfs }, { id: IDS.competitorX, placeId: 'p1', cid: null });
    expect((await dbs.owner.select().from(competitor).where(eq(competitor.id, IDS.competitorX)))[0]?.name).toBe('Smith HVAC');
  });
});
