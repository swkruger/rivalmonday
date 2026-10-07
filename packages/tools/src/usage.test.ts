import { llmCall, vendorCall } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { agencyLevelSpend, monthStart, spendByClient, spendLevel } from './usage';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

describe('usage math', () => {
  it('starts the month at 00:00 UTC on the 1st', () => {
    expect(monthStart(new Date('2026-10-07T15:00:00Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(monthStart(new Date('2026-01-01T00:00:00Z')).toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });
  it('warns at 80 % and is over at 100 %', () => {
    expect(spendLevel(11.99, 15)).toBe('ok');
    expect(spendLevel(12, 15)).toBe('warning');
    expect(spendLevel(15, 15)).toBe('over');
  });
});

describe('spend from the ledger (decision 6)', () => {
  it('sums this month’s llm and vendor rows per client; ignores last month, other clients and platform rows', async () => {
    const llm = (clientId: string | null, costUsd: number | null, createdAt: Date, agencyId: string | null = IDS.agencyA) =>
      ({ agencyId, clientId, task: 't', provider: 'p', model: 'm', inputTokens: 1, outputTokens: 1, costUsd, latencyMs: 1, ok: true, createdAt });
    const vendor = (clientId: string | null, costUsd: number | null, createdAt: Date, agencyId: string | null = IDS.agencyA) =>
      ({ agencyId, clientId, vendor: 'dataforseo', operation: 'x', units: 1, costUsd, latencyMs: 1, ok: true, createdAt });
    const now = new Date('2026-10-07T12:00:00Z');
    await dbs.owner.insert(llmCall).values([llm(IDS.clientA1, 1.25, now), llm(IDS.clientA1, 9, new Date('2026-09-30T23:59:59Z')), llm(IDS.clientA1, null, now), llm(null, 2, now), llm(null, 5, now, null)]);
    await dbs.owner.insert(vendorCall).values([vendor(IDS.clientA1, 0.5, now), vendor(IDS.clientA2, 3, now)]);
    const m = await spendByClient(dbs.service, [IDS.clientA1, IDS.clientA2, IDS.clientB1], monthStart(now));
    expect(m.get(IDS.clientA1)).toBeCloseTo(1.75);
    expect(m.get(IDS.clientA2)).toBeCloseTo(3);
    expect(m.get(IDS.clientB1) ?? 0).toBe(0);
    expect(await agencyLevelSpend(dbs.service, IDS.agencyA, monthStart(now))).toBeCloseTo(2);
  });
});
