import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { createLedgerSink } from './ledger';
import { client } from './schema';
import { competitorTrackers, SPEND_GUARD_EXCLUDED_PROVIDERS, spendByClient } from './spend';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const SINCE = new Date(Date.now() - 86_400_000);
const llm = { task: 'x', provider: 'openrouter', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 1, latencyMs: 1, ok: true, agencyId: null, clientId: null };
const vendor = (costUsd: number, competitorId: string) => ({ agencyId: null, clientId: null, competitorId, vendor: 'dataforseo', operation: 'o', units: 1, costUsd, latencyMs: 1, ok: true });
const spend = (ids: string[]) => spendByClient(dbs.service, ids, SINCE);

describe('spendByClient shared-cost attribution (O11)', () => {
  it('two active trackers each get half', async () => {
    await createLedgerSink(dbs.service).recordVendorCall(vendor(1, IDS.competitorX));
    const m = await spend([IDS.clientA1, IDS.clientB1, IDS.clientA2]);
    expect(m.get(IDS.clientA1)).toBeCloseTo(0.5, 6);
    expect(m.get(IDS.clientB1)).toBeCloseTo(0.5, 6);
    expect(m.get(IDS.clientA2) ?? 0).toBe(0);
  });
  it('archived / paused_at tracker gets no share and the others split', async () => {
    await createLedgerSink(dbs.service).recordVendorCall(vendor(1, IDS.competitorX));
    await dbs.owner.update(client).set({ archivedAt: new Date() }).where(eq(client.id, IDS.clientB1));
    expect((await spend([IDS.clientA1, IDS.clientB1])).get(IDS.clientA1)).toBeCloseTo(1, 6);
    await dbs.owner.update(client).set({ archivedAt: null, pausedAt: new Date() }).where(eq(client.id, IDS.clientB1));
    const m = await spend([IDS.clientA1, IDS.clientB1]);
    expect(m.get(IDS.clientA1)).toBeCloseTo(1, 6);
    expect(m.get(IDS.clientB1) ?? 0).toBe(0);
  });
  it('prospect tracker shares', async () => {
    await createLedgerSink(dbs.service).recordVendorCall(vendor(1, IDS.competitorX));
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientB1));
    expect((await spend([IDS.clientB1])).get(IDS.clientB1)).toBeCloseTo(0.5, 6);
  });
  it('self competitor counts as a tracker', async () => {
    await dbs.owner.update(client).set({ selfCompetitorId: IDS.competitorX }).where(eq(client.id, IDS.clientA2));
    await createLedgerSink(dbs.service).recordVendorCall(vendor(0.9, IDS.competitorX));
    const m = await spend([IDS.clientA1, IDS.clientA2, IDS.clientB1]);
    for (const id of [IDS.clientA1, IDS.clientA2, IDS.clientB1]) expect(m.get(id)).toBeCloseTo(0.3, 6);
  });
  it('spend-paused client keeps its share', async () => {
    await createLedgerSink(dbs.service).recordVendorCall(vendor(1, IDS.competitorX));
    await dbs.owner.update(client).set({ spendPausedAt: new Date() }).where(eq(client.id, IDS.clientB1));
    expect((await spend([IDS.clientB1])).get(IDS.clientB1)).toBeCloseTo(0.5, 6);
  });
  it('jev rows ignored, llm rows counted', async () => {
    const sink = createLedgerSink(dbs.service);
    await sink.recordLlmCall({ ...llm, competitorId: IDS.competitorY, costUsd: 2 });
    await sink.recordLlmCall({ ...llm, competitorId: IDS.competitorY, provider: 'jev', costUsd: 50 });
    await sink.recordLlmCall({ ...llm, clientId: IDS.clientA2, agencyId: IDS.agencyA, provider: 'jev', costUsd: 50 });
    await sink.recordLlmCall({ ...llm, clientId: IDS.clientA2, agencyId: IDS.agencyA, costUsd: 1 });
    expect(SPEND_GUARD_EXCLUDED_PROVIDERS).toEqual(['jev']);
    expect((await spend([IDS.clientA2])).get(IDS.clientA2)).toBeCloseTo(3, 6);
  });
  it('a client-attributed row is not also shared', async () => {
    await createLedgerSink(dbs.service).recordVendorCall({ ...vendor(1, IDS.competitorX), clientId: IDS.clientA1, agencyId: IDS.agencyA });
    const m = await spend([IDS.clientA1, IDS.clientB1]);
    expect(m.get(IDS.clientA1)).toBeCloseTo(1, 6);
    expect(m.get(IDS.clientB1) ?? 0).toBe(0);
  });
  it('rows before since are ignored', async () => {
    await createLedgerSink(dbs.service).recordVendorCall(vendor(1, IDS.competitorX));
    expect((await spendByClient(dbs.service, [IDS.clientA1], new Date(Date.now() + 60_000))).get(IDS.clientA1) ?? 0).toBe(0);
  });
});

describe('competitorTrackers', () => {
  it('maps competitor to current tracker client ids (self + client_competitor, no duplicates)', async () => {
    await dbs.owner.update(client).set({ selfCompetitorId: IDS.competitorX }).where(eq(client.id, IDS.clientA1));
    await dbs.owner.update(client).set({ pausedAt: new Date() }).where(eq(client.id, IDS.clientA2));
    const m = await competitorTrackers(dbs.service, [IDS.competitorX, IDS.competitorY]);
    expect([...(m.get(IDS.competitorX) ?? [])].sort()).toEqual([IDS.clientA1, IDS.clientB1].sort());
    expect(m.has(IDS.competitorY)).toBe(false);
    expect((await competitorTrackers(dbs.service, [])).size).toBe(0);
  });
});
