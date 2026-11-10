import { capture, citationListing } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import { assemblePack, citationCatalogue, type Directory, loadVerticalPack, splitPack } from '@cs/verticals';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { auditBusiness, type CitationBudget, type CitationRow, upsertCitationRows } from './audit';
import { CITATION_CALL_USD, CITATION_RUN_CAP_USD, citationSearch } from './search';
import stage1 from './__fixtures__/citation-stage1.json';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const scope = { agencyId: null, clientId: null };
const dir = (host: string): Directory => ({ host, label: host, add_listing_url: `https://${host}/add` });
const CAT = [dir('mapquest.com'), dir('bbb.org'), dir('chamberofcommerce.com')];
const biz = { competitorId: IDS.competitorX, name: 'Atomic Plumbing', phone: '(817) 219-4790', city: 'Granbury', domain: 'atomicplumbing.example' };
const budget = (spentUsd = 0): CitationBudget => ({ spentUsd, capUsd: CITATION_RUN_CAP_USD });
const SELF = { isSelf: true }, RIVAL = { isSelf: false };
const item = (host: string, title: string, description = '', rank = 1) => ({
  type: 'organic', rank_group: rank, domain: 'www.google.com', url: 'https://www.google.com/goto', title, description, breadcrumb: `https://www.${host} › x`,
});
const page = (...items: ReturnType<typeof item>[]) => [{ items }];
const keywords = (dfs: ReturnType<typeof fakeDfs>) => dfs.calls.map((c) => c.body![0]!.keyword as string);
const deps = (dfs: ReturnType<typeof fakeDfs>) => ({ db: dbs.service, store: createMemoryStore(), dfs });

describe('citationSearch', () => {
  it('posts location 2840, language en, depth 20 and reads up to 20 organic items', async () => {
    const result = (stage1 as { tasks: { result: unknown[] }[] }).tasks[0]!.result;
    const dfs = fakeDfs(() => [dfsTask(result)]);
    const r = await citationSearch(dfs, { query: '"Atomic Plumbing" "817-219-4790"', depth: 20 }, scope);
    expect(dfs.calls[0]!.body).toEqual([{ keyword: '"Atomic Plumbing" "817-219-4790"', location_code: 2840, language_code: 'en', depth: 20 }]);
    expect(r.organic.length).toBeGreaterThan(10);
    expect(r.organic.length).toBeLessThanOrEqual(20);
    expect(r.raw).toBe(result);
  });
  it('an empty page is nothing found, a failed task throws', async () => {
    expect((await citationSearch(fakeDfs(() => [dfsTask([{ items: [] }])]), { query: 'q', depth: 20 }, scope)).organic).toEqual([]);
    await expect(citationSearch(fakeDfs(() => [dfsTask(null, { statusCode: 50000, statusMessage: 'x' })]), { query: 'q', depth: 20 }, scope)).rejects.toThrow();
  });
});

describe('auditBusiness', () => {
  it('phone: stage-1 call then one stage-2 call for missed hosts (no site:, depth 20)', async () => {
    const dfs = fakeDfs((_m, _p, body) => {
      const k = body![0]!.keyword as string;
      return [dfsTask(k.includes('817-219-4790')
        ? page(item('mapquest.com', 'Atomic Plumbing, LLC', 'call 817-219-4790'))
        : page(item('bbb.org', 'Atomic Plumbing - Granbury, TX - BBB')))];
    });
    const b = budget();
    const r = await auditBusiness(deps(dfs), biz, CAT, b, scope, SELF);
    expect(keywords(dfs)).toEqual(['"Atomic Plumbing" "817-219-4790"', '"Atomic Plumbing" Granbury']);
    expect(dfs.calls.every((c) => c.body![0]!.depth === 20 && !String(c.body![0]!.keyword).includes('site:'))).toBe(true);
    const by = Object.fromEntries(r.rows.map((x) => [x.host, x]));
    expect(by['mapquest.com']).toMatchObject({ status: 'listed', inCatalogue: true });
    expect(by['mapquest.com']!.match).toMatchObject({ nameMatch: true, phoneMatch: true });
    expect(by['bbb.org']).toMatchObject({ status: 'listed' });
    expect(by['chamberofcommerce.com']).toMatchObject({ status: 'not_found', match: null });
    expect(by['bbb.org']!.captureId).not.toBe(by['mapquest.com']!.captureId);
    expect(r.calls).toBe(2);
    expect(r.stage1Ok).toBe(true);
    expect(r.usd).toBeCloseTo(2 * CITATION_CALL_USD, 10);
    expect(b.spentUsd).toBeCloseTo(0.008, 10);
    const caps = await dbs.owner.select().from(capture).where(eq(capture.competitorId, IDS.competitorX));
    expect(caps.map((c) => c.url).sort()).toEqual(['citations:name_city', 'citations:name_phone']);
    expect(caps.every((c) => c.source === 'directories' && c.collectorVersion === 'dfs/1' && c.status === 'ok')).toBe(true);
  });

  it('skips stage 2 when stage 1 found every catalogue host', async () => {
    const dfs = fakeDfs(() => [dfsTask(page(
      item('mapquest.com', 'Atomic Plumbing, LLC', '817-219-4790'), item('bbb.org', 'Atomic Plumbing', '817-219-4790'), item('chamberofcommerce.com', 'Atomic Plumbing', '817-219-4790'),
    ))]);
    const r = await auditBusiness(deps(dfs), biz, CAT, budget(), scope, SELF);
    expect(dfs.calls).toHaveLength(1);
    expect(r.rows.map((x) => x.status)).toEqual(['listed', 'listed', 'listed']);
  });

  it('no phone: stage 2 only, phone_match null', async () => {
    const dfs = fakeDfs(() => [dfsTask(page(item('mapquest.com', 'Atomic Plumbing, LLC', 'Granbury 817-555-0000')))]);
    const r = await auditBusiness(deps(dfs), { ...biz, phone: null }, CAT, budget(), scope, SELF);
    expect(keywords(dfs)).toEqual(['"Atomic Plumbing" Granbury']);
    expect(r.rows.find((x) => x.host === 'mapquest.com')!.match!.phoneMatch).toBeNull();
    expect(r.calls).toBe(1);
    expect(r.stage1Ok).toBe(false);
  });

  it('no city: stage-2 query is the quoted name only', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [] }])]);
    await auditBusiness(deps(dfs), { ...biz, phone: null, city: null }, CAT, budget(), scope, SELF);
    expect(keywords(dfs)).toEqual(['"Atomic Plumbing"']);
  });

  it('stage-1 vendor error: stage 2 classifies every host with null phone_match, a vendor_error capture is stored', async () => {
    let n = 0;
    const dfs = fakeDfs(() => (n++ === 0 ? [dfsTask(null, { statusCode: 50000, statusMessage: 'boom' })] : [dfsTask(page(item('mapquest.com', 'Atomic Plumbing, LLC', 'Granbury 817-219-4790')))]));
    const r = await auditBusiness(deps(dfs), biz, CAT, budget(), scope, SELF);
    expect(r.stage1Ok).toBe(false);
    expect(r.rows).toHaveLength(3);
    expect(r.rows.find((x) => x.host === 'mapquest.com')!.match!.phoneMatch).toBeNull();
    expect(r.rows.filter((x) => x.status === 'not_found')).toHaveLength(2);
    const caps = await dbs.owner.select().from(capture).where(eq(capture.competitorId, IDS.competitorX));
    expect(caps.filter((c) => c.status === 'vendor_error')).toHaveLength(1);
    expect(caps.find((c) => c.status === 'vendor_error')!.url).toBe('citations:name_phone');
  });

  it('stage-2 vendor error writes no rows for the missed hosts (P2)', async () => {
    let n = 0;
    const dfs = fakeDfs(() => (n++ === 0 ? [dfsTask(page(item('mapquest.com', 'Atomic Plumbing, LLC', '817-219-4790')))] : [dfsTask(null, { statusCode: 50000, statusMessage: 'x' })]));
    const r = await auditBusiness(deps(dfs), biz, CAT, budget(), scope, SELF);
    expect(r.rows.map((x) => x.host)).toEqual(['mapquest.com']);
  });

  it('RF5 stops before crossing 0.20 (spent 0.197: no call, capped, no rows)', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [] }])]);
    const b = budget(0.197);
    const r = await auditBusiness(deps(dfs), biz, CAT, b, scope, SELF);
    expect(dfs.calls).toHaveLength(0);
    expect(r).toMatchObject({ rows: [], calls: 0, usd: 0, capped: true });
    expect(b.spentUsd).toBe(0.197);
  });

  it('caps between stages: stage 1 runs, stage 2 does not', async () => {
    const dfs = fakeDfs(() => [dfsTask(page(item('mapquest.com', 'Atomic Plumbing, LLC', '817-219-4790')))]);
    const r = await auditBusiness(deps(dfs), biz, CAT, budget(0.194), scope, SELF);
    expect(dfs.calls).toHaveLength(1);
    expect(r.capped).toBe(true);
    expect(r.rows.map((x) => x.host)).toEqual(['mapquest.com']);
  });

  it('RF3 the dental catalogue never classifies or stores angi.com, and no query has site:', async () => {
    const g = splitPack(await loadVerticalPack('generic'));
    const d = splitPack(await loadVerticalPack('dental'));
    const toRow = (s: typeof g) => ({ ...s.row, status: 'reviewed' as const, mergedInto: null, draftEvidence: null, createdByAgencyId: null });
    const pack = assemblePack(toRow(d), d.areas.map((a) => ({ ...a, verticalId: 'dental', status: 'reviewed' as const, mergedInto: null, evidence: null, createdByAgencyId: null })), toRow(g));
    const catalogue = citationCatalogue(pack);
    expect(catalogue.length).toBeGreaterThan(0);
    expect(catalogue.some((x) => x.host === 'angi.com')).toBe(false);
    const dfs = fakeDfs(() => [dfsTask(page(item('angi.com', 'Atomic Plumbing - Granbury, TX', 'Granbury plumber')))]);
    const r = await auditBusiness(deps(dfs), biz, catalogue, budget(), scope, SELF);
    expect(r.rows.some((x) => x.host === 'angi.com')).toBe(false);
    expect(keywords(dfs).some((k) => k.includes('site:'))).toBe(false);
  });

  it('I2 also-found rows only for self: a rival gets catalogue rows only', async () => {
    const answer = () => [dfsTask(page(item('mapquest.com', 'Atomic Plumbing, LLC', '817-219-4790'), item('example-dir.com', 'Atomic Plumbing', '817-219-4790', 2)))];
    const rival = await auditBusiness(deps(fakeDfs(answer)), biz, CAT, budget(), scope, RIVAL);
    expect(rival.rows.length).toBeGreaterThan(0);
    expect(rival.rows.every((x) => x.inCatalogue)).toBe(true);
    const self = await auditBusiness(deps(fakeDfs(answer)), biz, CAT, budget(), scope, SELF);
    expect(self.rows.find((x) => !x.inCatalogue)).toMatchObject({ host: 'example-dir.com', status: 'listed' });
  });

  it('okCalls counts only answered calls', async () => {
    let n = 0;
    const dfs = fakeDfs(() => (n++ === 0 ? [dfsTask(null, { statusCode: 50000, statusMessage: 'boom' })] : [dfsTask([{ items: [] }])]));
    const r = await auditBusiness(deps(dfs), biz, CAT, budget(), scope, SELF);
    expect(r).toMatchObject({ calls: 2, okCalls: 1 });
  });

  it('a banned host never appears as a row nor as also-found', async () => {
    const dfs = fakeDfs(() => [dfsTask(page(item('yelp.com', 'Atomic Plumbing', '817-219-4790'), item('example-dir.com', 'Atomic Plumbing', '817-219-4790', 2)))]);
    const r = await auditBusiness(deps(dfs), biz, CAT, budget(), scope, SELF);
    expect(r.rows.some((x) => x.host.includes('yelp'))).toBe(false);
    expect(r.rows.find((x) => !x.inCatalogue)).toMatchObject({ host: 'example-dir.com', status: 'listed' });
    await upsertCitationRows(dbs.service, IDS.competitorX, [{ host: 'yelp.com', status: 'listed', inCatalogue: false, match: null, captureId: r.rows[0]!.captureId }], new Date(), { stage1Ok: false, isSelf: true });
    expect(await dbs.owner.select().from(citationListing)).toHaveLength(0);
  });
});

describe('auditBusiness error handling', () => {
  it('a non-vendor error (capture write fails) propagates, with no vendor_error capture', async () => {
    const dfs = fakeDfs(() => [dfsTask(page(item('mapquest.com', 'Atomic Plumbing, LLC', '817-219-4790')))]);
    const store = { ...createMemoryStore(), put: async () => { throw new Error('disk full'); } };
    await expect(auditBusiness({ db: dbs.service, store, dfs }, biz, CAT, budget(), scope, SELF)).rejects.toThrow('disk full');
    expect(await dbs.owner.select().from(capture)).toHaveLength(0);
  });
  it('quotes in the city are stripped from the stage-2 query', async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [] }])]);
    await auditBusiness(deps(dfs), { ...biz, phone: null, city: 'Gran"bury' }, CAT, budget(), scope, SELF);
    expect(keywords(dfs)).toEqual(['"Atomic Plumbing" Gran bury']);
  });
});

describe('upsertCitationRows', () => {
  const T1 = new Date('2026-11-01T00:00:00Z'), T2 = new Date('2026-11-08T00:00:00Z'), T3 = new Date('2026-11-15T00:00:00Z');
  let captureId: string;
  beforeEach(async () => {
    const dfs = fakeDfs(() => [dfsTask([{ items: [] }])]);
    await auditBusiness(deps(dfs), { ...biz, phone: null }, [dir('bbb.org')], budget(), scope, SELF);
    captureId = (await dbs.owner.select().from(capture))[0]!.id;
  });
  const row = (host: string, status: CitationRow['status'], inCatalogue = true): CitationRow => ({
    host, status, inCatalogue, captureId, match: status === 'listed' ? { url: `https://${host}/x`, title: 'T', nameMatch: true, phoneMatch: null, shownPhone: null } : null,
  });
  const get = async (host: string) => (await dbs.owner.select().from(citationListing).where(eq(citationListing.host, host)))[0]!;

  it('not_found -> listed sets newly_found_at; first_seen_at is the first listed time', async () => {
    await upsertCitationRows(dbs.service, IDS.competitorX, [row('bbb.org', 'not_found')], T1, { stage1Ok: true, isSelf: true });
    await upsertCitationRows(dbs.service, IDS.competitorX, [row('bbb.org', 'listed')], T2, { stage1Ok: true, isSelf: true });
    expect(await get('bbb.org')).toMatchObject({ status: 'listed', firstSeenAt: T2, lastSeenAt: T2, newlyFoundAt: T2, checkedAt: T2, listingUrl: 'https://bbb.org/x' });
    await upsertCitationRows(dbs.service, IDS.competitorX, [row('bbb.org', 'listed')], T3, { stage1Ok: true, isSelf: true });
    expect(await get('bbb.org')).toMatchObject({ firstSeenAt: T2, lastSeenAt: T3, newlyFoundAt: T2 });
  });

  it('first insert as listed leaves newly_found_at null', async () => {
    await upsertCitationRows(dbs.service, IDS.competitorX, [row('bbb.org', 'listed')], T1, { stage1Ok: true, isSelf: true });
    expect(await get('bbb.org')).toMatchObject({ firstSeenAt: T1, lastSeenAt: T1, newlyFoundAt: null });
  });

  it('listed -> not_found keeps first/last_seen_at and nulls newly_found_at', async () => {
    await upsertCitationRows(dbs.service, IDS.competitorX, [row('bbb.org', 'not_found')], T1, { stage1Ok: true, isSelf: true });
    await upsertCitationRows(dbs.service, IDS.competitorX, [row('bbb.org', 'listed')], T2, { stage1Ok: true, isSelf: true });
    await upsertCitationRows(dbs.service, IDS.competitorX, [row('bbb.org', 'not_found')], T3, { stage1Ok: true, isSelf: true });
    expect(await get('bbb.org')).toMatchObject({ status: 'not_found', firstSeenAt: T2, lastSeenAt: T2, newlyFoundAt: null, checkedAt: T3, listingUrl: null });
  });

  it('a missed also-found host is deleted only when stage1Ok', async () => {
    await upsertCitationRows(dbs.service, IDS.competitorX, [row('bbb.org', 'listed'), row('other.example', 'listed', false)], T1, { stage1Ok: true, isSelf: true });
    await upsertCitationRows(dbs.service, IDS.competitorX, [row('bbb.org', 'listed')], T2, { stage1Ok: false, isSelf: true });
    expect((await dbs.owner.select().from(citationListing)).map((r) => r.host).sort()).toEqual(['bbb.org', 'other.example']);
    await upsertCitationRows(dbs.service, IDS.competitorX, [row('bbb.org', 'listed')], T3, { stage1Ok: true, isSelf: true });
    expect((await dbs.owner.select().from(citationListing)).map((r) => r.host)).toEqual(['bbb.org']);
  });

  it('I2 in_catalogue is never downgraded, so a narrower catalogue never demotes or deletes the row', async () => {
    await upsertCitationRows(dbs.service, IDS.competitorX, [row('angi.com', 'not_found')], T1, { stage1Ok: true, isSelf: false });
    await upsertCitationRows(dbs.service, IDS.competitorX, [row('angi.com', 'listed', false)], T2, { stage1Ok: true, isSelf: true });
    expect(await get('angi.com')).toMatchObject({ inCatalogue: true, status: 'listed', newlyFoundAt: T2 });
    await upsertCitationRows(dbs.service, IDS.competitorX, [row('bbb.org', 'listed')], T3, { stage1Ok: true, isSelf: true });
    expect(await get('angi.com')).toMatchObject({ inCatalogue: true });
  });

  it('I2 a rival upsert never deletes also-found rows written for another client\'s self', async () => {
    await upsertCitationRows(dbs.service, IDS.competitorX, [row('bbb.org', 'listed'), row('other.example', 'listed', false)], T1, { stage1Ok: true, isSelf: true });
    await upsertCitationRows(dbs.service, IDS.competitorX, [row('bbb.org', 'listed')], T2, { stage1Ok: true, isSelf: false });
    expect((await dbs.owner.select().from(citationListing)).map((r) => r.host).sort()).toEqual(['bbb.org', 'other.example']);
  });
});
