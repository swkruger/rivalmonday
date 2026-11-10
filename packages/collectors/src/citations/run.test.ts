import { capture, citationAuditRun, citationListing, client, clientCompetitor, clientSetup, competitor, competitorSignal, observation } from '@cs/db';
import { IDS, openTestDbs, pauseAgency, seedTenancy, spendPauseClient, truncateAll } from '@cs/db/test-helpers';
import { createMemoryStore } from '@cs/storage';
import type { VerticalPack } from '@cs/verticals';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { dfsTask, fakeDfs } from '../../test/fake-dfs';
import { auditedCompetitors, CITATION_CADENCE_DAYS, CITATION_RUN_STALE_HOURS, failStaleCitationRuns, listCitationDueClients, runCitationAudit } from './run';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const NOW = new Date('2026-11-10T12:00:00Z');
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const dir = (host: string) => ({ host, label: host, add_listing_url: `https://${host}/add` });
const pack = { citations: { groups: ['general'], min_missing: 3, directory_groups: { general: [dir('mapquest.com'), dir('bbb.org')] } } } as unknown as VerticalPack;
const emptyPack = { citations: { groups: ['general'], min_missing: 3 } } as unknown as VerticalPack;
const page = (host: string, title: string) => [{ items: [{ type: 'organic', rank_group: 1, domain: 'www.google.com', url: 'https://www.google.com/goto', title, description: '', breadcrumb: `https://www.${host} › x` }] }];
const emptyDfs = () => fakeDfs(() => [dfsTask([{ items: [] }])]);
const RIVAL_A = '00000000-0000-4000-8000-0000000000f3';
const RIVAL_B = '00000000-0000-4000-8000-0000000000f4';
const RIVAL_C = '00000000-0000-4000-8000-0000000000f5';
const SELF = '00000000-0000-4000-8000-0000000000f6';
const run = (dfs: ReturnType<typeof fakeDfs>, p = pack) => runCitationAudit({ db: dbs.service, store: createMemoryStore(), dfs, packs: async () => p, now: () => NOW }, IDS.clientA1);
const listing = (competitorId: string, checkedAt: Date, host: string) =>
  ({ competitorId, host, status: 'not_found' as const, inCatalogue: true, checkedAt });
const priorRun = (status: 'done' | 'capped' | 'failed' | 'running', startedAt: Date) =>
  dbs.owner.insert(citationAuditRun).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'setup', status, competitorIds: [], startedAt });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

async function track(ids: { id: string; tier?: 'top' | 'watch' | 'minor'; overlap?: number | null }[]) {
  await dbs.owner.insert(competitor).values(ids.map((r) => ({ id: r.id, name: `Rival ${r.id.slice(-2)}` })));
  await dbs.owner.insert(clientCompetitor).values(ids.map((r) => ({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: r.id })));
  const signals = ids.filter((r) => r.tier);
  if (signals.length > 0) await dbs.owner.insert(competitorSignal).values(signals.map((r) => ({ agencyId: IDS.agencyA, clientId: IDS.clientA1, competitorId: r.id, tier: r.tier!, overlap: r.overlap ?? null, signals: {} })));
}

describe('listCitationDueClients', () => {
  it('a client with no setup row and no run is due', async () => {
    expect(await listCitationDueClients(dbs.service, NOW)).toContain(IDS.clientA1);
  });
  it('competitors not done excludes, done includes', async () => {
    await dbs.owner.insert(clientSetup).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA });
    expect(await listCitationDueClients(dbs.service, NOW)).not.toContain(IDS.clientA1);
    await dbs.owner.update(clientSetup).set({ competitorsDoneAt: day(1) }).where(eq(clientSetup.clientId, IDS.clientA1));
    expect(await listCitationDueClients(dbs.service, NOW)).toContain(IDS.clientA1);
  });
  it('a done run 29 days ago is not due, 30 days ago is due', async () => {
    await priorRun('done', day(CITATION_CADENCE_DAYS - 1));
    expect(await listCitationDueClients(dbs.service, NOW)).not.toContain(IDS.clientA1);
    await dbs.owner.delete(citationAuditRun);
    await priorRun('capped', day(CITATION_CADENCE_DAYS));
    expect(await listCitationDueClients(dbs.service, NOW)).toContain(IDS.clientA1);
  });
  it('a failed-only history is due again; a running run is not due', async () => {
    await priorRun('failed', day(1));
    expect(await listCitationDueClients(dbs.service, NOW)).toContain(IDS.clientA1);
    await priorRun('running', day(0));
    expect(await listCitationDueClients(dbs.service, NOW)).not.toContain(IDS.clientA1);
  });
  it('spend-paused clients, archived clients and read-only agencies are excluded', async () => {
    await spendPauseClient(dbs.owner, IDS.clientA1);
    await dbs.owner.update(client).set({ archivedAt: NOW }).where(eq(client.id, IDS.clientA2));
    await pauseAgency(dbs.owner, IDS.agencyB);
    expect(await listCitationDueClients(dbs.service, NOW)).toEqual([]);
  });
});

describe('auditedCompetitors', () => {
  it('top tier by overlap, at most 3, self never included', async () => {
    await track([{ id: RIVAL_A, tier: 'top', overlap: 0.2 }, { id: RIVAL_B, tier: 'top', overlap: 0.9 }, { id: RIVAL_C, tier: 'top', overlap: null }, { id: SELF, tier: 'top', overlap: 1 }]);
    await dbs.owner.update(client).set({ selfCompetitorId: SELF }).where(eq(client.id, IDS.clientA1));
    const r = await auditedCompetitors(dbs.service, IDS.clientA1);
    expect(r.selfId).toBe(SELF);
    expect(r.rivalIds).toEqual([RIVAL_B, RIVAL_A, RIVAL_C]);
  });
  it('falls back to the 3 tracked rivals with the highest overlap when none is top', async () => {
    await track([{ id: RIVAL_A, tier: 'watch', overlap: 0.2 }, { id: RIVAL_B, tier: 'minor', overlap: 0.9 }, { id: RIVAL_C, tier: 'watch', overlap: 0.5 }, { id: SELF }]);
    await dbs.owner.update(client).set({ selfCompetitorId: SELF }).where(eq(client.id, IDS.clientA1));
    const r = await auditedCompetitors(dbs.service, IDS.clientA1);
    expect(r.rivalIds).toHaveLength(3);
    expect(r.rivalIds).not.toContain(SELF);
    expect(r.rivalIds.slice(0, 3)).toEqual([RIVAL_B, RIVAL_C, RIVAL_A]);
  });
});

describe('runCitationAudit', () => {
  it('searches self and rivals, stores rows and a done run with the ids', async () => {
    await track([{ id: RIVAL_A, tier: 'top', overlap: 0.5 }, { id: SELF }]);
    await dbs.owner.update(client).set({ selfCompetitorId: SELF, phone: '(817) 219-4790', address: { line1: '1 Main', city: 'Granbury', region: 'TX', postalCode: '76048', country: 'US' } }).where(eq(client.id, IDS.clientA1));
    const dfs = fakeDfs((_m, _p, body) => [dfsTask(String(body![0]!.keyword).includes('Rival') ? page('mapquest.com', 'Rival 3 - Granbury, TX') : [{ items: [] }])]);
    const r = await run(dfs);
    expect(r).toMatchObject({ status: 'done' });
    expect(r.calls).toBeGreaterThan(0);
    const [row] = await dbs.owner.select().from(citationAuditRun);
    expect(row).toMatchObject({ status: 'done', trigger: 'setup', calls: r.calls });
    expect(row!.competitorIds).toEqual([SELF, RIVAL_A]);
    expect(row!.finishedAt).not.toBeNull();
    expect((await dbs.owner.select().from(citationListing).where(eq(citationListing.competitorId, SELF))).map((l) => l.host).sort()).toEqual(['bbb.org', 'mapquest.com']);
    expect(dfs.calls.every((c) => c.scope?.clientId === IDS.clientA1 && c.scope?.verticalId === 'hvac_plumbing')).toBe(true);
  });
  it('a later run after a done run is monthly', async () => {
    await track([{ id: RIVAL_A, tier: 'top', overlap: 0.5 }]);
    await priorRun('done', day(40));
    await run(emptyDfs());
    const runs = await dbs.owner.select().from(citationAuditRun);
    expect(runs.map((x) => x.trigger)).toEqual(['setup', 'monthly']);
  });
  it('over the monthly cost guard: capped with 0 calls and no vendor call', async () => {
    await track([{ id: RIVAL_A, tier: 'top', overlap: 0.5 }, { id: SELF }]);
    await dbs.owner.update(client).set({ selfCompetitorId: SELF, spendLimitUsd: 0.01 }).where(eq(client.id, IDS.clientA1));
    const dfs = emptyDfs();
    expect(await run(dfs)).toMatchObject({ status: 'capped', calls: 0, usd: 0 });
    expect(dfs.calls).toHaveLength(0);
    expect((await dbs.owner.select().from(citationAuditRun))[0]).toMatchObject({ status: 'capped', calls: 0 });
  });
  it('reuse: a rival checked 10 days ago by another client costs 0 calls and stays in competitor_ids', async () => {
    await track([{ id: RIVAL_A, tier: 'top', overlap: 0.5 }]);
    await dbs.owner.insert(citationListing).values([listing(RIVAL_A, day(10), 'mapquest.com'), listing(RIVAL_A, day(10), 'bbb.org')]);
    const dfs = emptyDfs();
    expect(await run(dfs)).toMatchObject({ status: 'done', calls: 0, usd: 0 });
    expect(dfs.calls).toHaveLength(0);
    expect((await dbs.owner.select().from(citationAuditRun))[0]!.competitorIds).toEqual([RIVAL_A]);
  });
  it('not reused when a host is missing or the check is older than 25 days', async () => {
    await track([{ id: RIVAL_A, tier: 'top', overlap: 0.5 }]);
    await dbs.owner.insert(citationListing).values([listing(RIVAL_A, day(26), 'mapquest.com'), listing(RIVAL_A, day(1), 'bbb.org')]);
    const dfs = emptyDfs();
    expect((await run(dfs)).calls).toBeGreaterThan(0);
  });
  it('an empty catalogue is skipped without a run row', async () => {
    await track([{ id: RIVAL_A, tier: 'top', overlap: 0.5 }]);
    expect(await run(emptyDfs(), emptyPack)).toMatchObject({ runId: null, status: 'skipped' });
    expect(await dbs.owner.select().from(citationAuditRun)).toEqual([]);
  });
  it('a live running row skips; a spend-paused client skips', async () => {
    await track([{ id: RIVAL_A, tier: 'top', overlap: 0.5 }]);
    await priorRun('running', day(0));
    expect(await run(emptyDfs())).toMatchObject({ runId: null, status: 'skipped' });
    await dbs.owner.delete(citationAuditRun);
    await spendPauseClient(dbs.owner, IDS.clientA1);
    expect(await run(emptyDfs())).toMatchObject({ runId: null, status: 'skipped' });
  });
  it('a non-vendor error ends the run failed', async () => {
    await track([{ id: RIVAL_A, tier: 'top', overlap: 0.5 }]);
    const dfs = fakeDfs(() => { throw new TypeError('boom'); });
    await expect(run(dfs)).rejects.toThrow('boom');
    expect((await dbs.owner.select().from(citationAuditRun))[0]).toMatchObject({ status: 'failed' });
  });
  it('every vendor call failing ends the run failed (no rethrow) and the client is due again', async () => {
    await track([{ id: RIVAL_A, tier: 'top', overlap: 0.5 }]);
    const dfs = fakeDfs(() => [dfsTask(null, { statusCode: 50000, statusMessage: 'outage' })]);
    const r = await run(dfs);
    expect(r.status).toBe('failed');
    expect(r.calls).toBeGreaterThan(0);
    expect((await dbs.owner.select().from(citationAuditRun))[0]).toMatchObject({ status: 'failed', calls: r.calls });
    expect(await listCitationDueClients(dbs.service, NOW)).toContain(IDS.clientA1);
  });
  it('one answered call keeps the run done', async () => {
    await track([{ id: RIVAL_A, tier: 'top', overlap: 0.5 }]);
    let n = 0;
    const dfs = fakeDfs(() => (n++ === 0 ? [dfsTask([{ items: [] }])] : [dfsTask(null, { statusCode: 50000, statusMessage: 'outage' })]));
    expect((await run(dfs)).status).toBe('done');
  });
  it('uses the GBP phone and address city for a rival', async () => {
    await track([{ id: RIVAL_A, tier: 'top', overlap: 0.5 }]);
    await dbs.owner.insert(capture).values({ id: '00000000-0000-4000-8000-0000000000c9', competitorId: RIVAL_A, source: 'gbp', status: 'ok', collectorVersion: 'dfs/1' });
    await dbs.owner.insert(observation).values({ competitorId: RIVAL_A, captureId: '00000000-0000-4000-8000-0000000000c9', kind: 'gbp_profile', key: 'profile', data: { phone: '+1 817-219-4790', address: '1 Main St, Granbury, TX 76048, USA' } });
    const dfs = emptyDfs();
    await run(dfs);
    expect(dfs.calls.map((c) => c.body![0]!.keyword)).toEqual(['"Rival f3" "817-219-4790"', '"Rival f3" Granbury']);
  });
});

describe('runCitationAudit across clients (I2)', () => {
  const X = IDS.competitorX;
  const packOf = (...hosts: string[]) => ({ citations: { groups: ['general'], min_missing: 3, directory_groups: { general: hosts.map(dir) } } }) as unknown as VerticalPack;
  const PACK_A = packOf('mapquest.com', 'angi.com');
  const PACK_B = packOf('mapquest.com', 'chamberofcommerce.com');
  const hit = (host: string, rank: number) => ({ type: 'organic', rank_group: rank, domain: 'www.google.com', url: 'https://www.google.com/goto', title: 'Smith HVAC', description: 'call 817-219-4790', breadcrumb: `https://www.${host} › x` });
  const dfsWith = (hosts: string[]) => fakeDfs(() => [dfsTask([{ items: hosts.map((h, i) => hit(h, i + 1)) }])]);
  const runFor = (clientId: string, p: VerticalPack, dfs: ReturnType<typeof fakeDfs>, at: Date) =>
    runCitationAudit({ db: dbs.service, store: createMemoryStore(), dfs, packs: async () => p, now: () => at }, clientId);
  const rowsOfX = async () => Object.fromEntries((await dbs.owner.select().from(citationListing).where(eq(citationListing.competitorId, X))).map((r) => [r.host, r]));

  it('a shared rival: B\'s narrower catalogue never demotes or deletes A\'s angi row; only self gets also-found rows', async () => {
    await dbs.owner.insert(capture).values({ id: '00000000-0000-4000-8000-0000000000c8', competitorId: X, source: 'gbp', status: 'ok', collectorVersion: 'dfs/1' });
    await dbs.owner.insert(observation).values({ competitorId: X, captureId: '00000000-0000-4000-8000-0000000000c8', kind: 'gbp_profile', key: 'profile', data: { phone: '+1 817-219-4790', address: '1 Main St, Granbury, TX 76048, USA' } });
    // A1: X is a rival. The page also shows an off-catalogue directory, which a rival never stores.
    expect((await runFor(IDS.clientA1, PACK_A, dfsWith(['angi.com', 'other-dir.example']), NOW)).status).toBe('done');
    let x = await rowsOfX();
    expect(x['angi.com']).toMatchObject({ status: 'listed', inCatalogue: true });
    expect(Object.values(x).some((r) => !r.inCatalogue)).toBe(false);
    // B1: X is its own business; angi.com is outside B1's catalogue, so it arrives as also-found.
    await dbs.owner.update(client).set({ selfCompetitorId: X }).where(eq(client.id, IDS.clientB1));
    expect((await runFor(IDS.clientB1, PACK_B, dfsWith(['angi.com', 'other-dir.example']), NOW)).status).toBe('done');
    x = await rowsOfX();
    expect(x['angi.com']).toMatchObject({ inCatalogue: true });
    expect(x['other-dir.example']).toMatchObject({ status: 'listed', inCatalogue: false });
    // B1 a month later sees neither: its stale also-found row goes (P12), A's catalogue row stays.
    expect((await runFor(IDS.clientB1, PACK_B, dfsWith(['mapquest.com']), new Date(NOW.getTime() + 26 * 86_400_000))).status).toBe('done');
    x = await rowsOfX();
    expect(x['angi.com']).toMatchObject({ inCatalogue: true });
    expect(x['other-dir.example']).toBeUndefined();
  });
});

describe('failStaleCitationRuns', () => {
  it('fails running runs older than 3 h only', async () => {
    await priorRun('running', new Date(NOW.getTime() - (CITATION_RUN_STALE_HOURS + 1) * 3_600_000));
    expect(await failStaleCitationRuns(dbs.service, NOW)).toBe(1);
    expect((await dbs.owner.select().from(citationAuditRun))[0]).toMatchObject({ status: 'failed' });
    await priorRun('running', new Date(NOW.getTime() - 3_600_000));
    expect(await failStaleCitationRuns(dbs.service, NOW)).toBe(0);
  });
});

describe('runCitationAudit with an adopted manual run (18c-2)', () => {
  const manualRow = () => dbs.owner.insert(citationAuditRun).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, trigger: 'manual', status: 'running', competitorIds: [], startedAt: NOW }).returning({ id: citationAuditRun.id });
  const adopt = (dfs: ReturnType<typeof fakeDfs>, runId: string) => runCitationAudit({ db: dbs.service, store: createMemoryStore(), dfs, packs: async () => pack, now: () => NOW }, IDS.clientA1, { runId });

  it('adopts the row: one row total, manual, ids filled, finished', async () => {
    await track([{ id: RIVAL_A, tier: 'top', overlap: 0.5 }, { id: SELF }]);
    await dbs.owner.update(client).set({ selfCompetitorId: SELF }).where(eq(client.id, IDS.clientA1));
    const [m] = await manualRow();
    const r = await adopt(emptyDfs(), m!.id);
    expect(r).toMatchObject({ runId: m!.id, status: 'done' });
    const rows = await dbs.owner.select().from(citationAuditRun);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: m!.id, trigger: 'manual', status: 'done' });
    expect(rows[0]!.competitorIds).toEqual([SELF, RIVAL_A]);
    expect(rows[0]!.finishedAt).not.toBeNull();
  });

  it('manual: self is re-searched even when fresh; a fresh rival is reused', async () => {
    await track([{ id: RIVAL_A, tier: 'top', overlap: 0.5 }, { id: SELF }]);
    await dbs.owner.update(client).set({ selfCompetitorId: SELF }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.insert(citationListing).values([RIVAL_A, SELF].flatMap((id) => [listing(id, day(1), 'mapquest.com'), listing(id, day(1), 'bbb.org')]));
    const [m] = await manualRow();
    const dfs = emptyDfs();
    await adopt(dfs, m!.id);
    expect(dfs.calls.length).toBeGreaterThan(0);
    const kws = dfs.calls.map((c) => String(c.body?.[0]?.keyword ?? ''));
    expect(kws.every((k) => k.includes('Rival f6'))).toBe(true); // self only; Rival f3 reused
  });

  it('a skip (no businesses to audit) fails the adopted row instead of leaving it running', async () => {
    await dbs.owner.delete(clientCompetitor);
    const [m] = await manualRow();
    expect(await adopt(emptyDfs(), m!.id)).toMatchObject({ status: 'skipped' });
    expect((await dbs.owner.select().from(citationAuditRun))[0]).toMatchObject({ id: m!.id, status: 'failed' });
  });
});
