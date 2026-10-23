import { client, llmCall, vendorCall } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { DISCOVERY_CALL_COST_USD } from '../rivals/cost';
import { checkRankScanBudget, estimateRankScanUsd } from './budget';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const now = new Date('2026-10-07T12:00:00Z');
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(client).set({ spendLimitUsd: 10 }).where(eq(client.id, IDS.clientA1));
});
const vendor = (costUsd: number, createdAt: Date) => ({
  agencyId: IDS.agencyA,
  clientId: IDS.clientA1,
  vendor: 'dataforseo',
  operation: 'x',
  units: 1,
  costUsd,
  latencyMs: 1,
  ok: true,
  createdAt,
});

describe('rank scan estimate and budget', () => {
  it('estimate 7×7×5 = 245 calls × maps rate', () => {
    const e = estimateRankScanUsd({ keywords: ['a', 'b', 'c', 'd', 'e', 'f'], rankKeywords: [], rankGridSize: 7, serviceArea: null });
    expect(e.calls).toBe(245);
    expect(e.usd).toBeCloseTo(245 * DISCOVERY_CALL_COST_USD.maps);
  });
  it('rank budget allows up to 130 % of the limit and refuses beyond', async () => {
    // limit 10 -> pause threshold 13
    await dbs.owner.insert(vendorCall).values(vendor(9, now));
    expect(await checkRankScanBudget(dbs.service, IDS.clientA1, 4, now)).toEqual({ ok: true });
    expect(await checkRankScanBudget(dbs.service, IDS.clientA1, 4.01, now)).toEqual({ ok: false, reason: 'cap' });
  });
  it('uses the platform default limit when there is no override', async () => {
    await dbs.owner.update(client).set({ spendLimitUsd: null }).where(eq(client.id, IDS.clientA1)); // default 15 -> 19.5
    expect(await checkRankScanBudget(dbs.service, IDS.clientA1, 19.5, now)).toEqual({ ok: true });
    expect(await checkRankScanBudget(dbs.service, IDS.clientA1, 19.51, now)).toEqual({ ok: false, reason: 'cap' });
  });
  it('counts llm and vendor rows of this month only', async () => {
    await dbs.owner.insert(vendorCall).values([vendor(3, now), vendor(50, new Date('2026-09-30T23:00:00Z'))]);
    await dbs.owner.insert(llmCall).values({
      agencyId: IDS.agencyA,
      clientId: IDS.clientA1,
      task: 't',
      provider: 'p',
      model: 'm',
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 2,
      latencyMs: 1,
      ok: true,
      createdAt: now,
    });
    expect(await checkRankScanBudget(dbs.service, IDS.clientA1, 8, now)).toEqual({ ok: true });
    expect(await checkRankScanBudget(dbs.service, IDS.clientA1, 8.01, now)).toEqual({ ok: false, reason: 'cap' });
  });
});
