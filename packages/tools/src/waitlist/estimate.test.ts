import { brief, llmCall, vendorCall } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { SAMPLE_DISCOVERY_CAP_USD, sampleCostEstimate } from './estimate';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const at = (day: number) => new Date(Date.UTC(2026, 9, day, 12));
/** A starting-point brief generated at `generatedAt` for `clientId`, with `llm` + `vendor` spend before it (and 100 USD of later spend that must not count). */
async function startingPoint(clientId: string, status: string, generatedAt: Date, llm: number, vendor: number): Promise<void> {
  await dbs.owner.insert(brief).values({
    agencyId: IDS.agencyA, clientId, kind: 'starting_point', status, deliveryDate: generatedAt.toISOString().slice(0, 10),
    periodStart: generatedAt, periodEnd: generatedAt, summary: 's', generatedAt,
  });
  const before = new Date(generatedAt.getTime() - 3_600_000);
  const after = new Date(generatedAt.getTime() + 3_600_000);
  await dbs.owner.insert(llmCall).values([
    { agencyId: IDS.agencyA, clientId, task: 't', provider: 'p', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: llm, latencyMs: 1, ok: true, createdAt: before },
    { agencyId: IDS.agencyA, clientId, task: 't', provider: 'p', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 100, latencyMs: 1, ok: true, createdAt: after },
  ]);
  await dbs.owner.insert(vendorCall).values({ agencyId: IDS.agencyA, clientId, vendor: 'v', operation: 'o', units: 1, costUsd: vendor, latencyMs: 1, ok: true, createdAt: before });
}

describe('sampleCostEstimate', () => {
  it('null with no history', async () => {
    expect(await sampleCostEstimate(dbs.service)).toEqual({ discoveryCapUsd: SAMPLE_DISCOVERY_CAP_USD, startingPointAvgUsd: null, basedOn: 0 });
    expect(SAMPLE_DISCOVERY_CAP_USD).toBe(3);
  });

  it('ignores starting points that are not approved or sent', async () => {
    await startingPoint(IDS.clientA1, 'ready', at(1), 1, 1);
    expect(await sampleCostEstimate(dbs.service)).toMatchObject({ startingPointAvgUsd: null, basedOn: 0 });
  });

  it('average of last 20: spend up to generation, rounded to cents', async () => {
    await startingPoint(IDS.clientA1, 'approved', at(1), 0.5, 0.25); // 0.75
    await startingPoint(IDS.clientA2, 'sent', at(2), 1, 0.5); // 1.50
    expect(await sampleCostEstimate(dbs.service)).toEqual({ discoveryCapUsd: 3, startingPointAvgUsd: 1.13, basedOn: 2 });
  });
});
