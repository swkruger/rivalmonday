import { client, llmCall } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { workerLog } from '../log';
import { createSpendGuardJobs } from './spend-guard';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  vi.spyOn(workerLog, 'info').mockImplementation(() => {});
});

const deps = { spendGuard: () => ({ service: dbs.service, appUrl: 'https://app.rm.test', platformAdmins: [], sendStaffEmail: async () => {} }) } as unknown as WorkerDeps;

describe('spend-guard job', () => {
  it('declares name, hourly cron, short queue, retryLimit 1 and payload schema', () => {
    const { guard } = createSpendGuardJobs({} as WorkerDeps, { envName: 'dev' });
    expect(guard).toMatchObject({ name: 'spend-guard', cron: '7 * * * *', queue: { policy: 'short', retryLimit: 1 } });
    expect(guard.schema.safeParse({}).success).toBe(true);
  });

  it.each(['test', 'demo'] as const)('skipped in %s: no work', async (envName) => {
    await dbs.owner.insert(llmCall).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, task: 't', provider: 'openrouter', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 99, latencyMs: 1, ok: true });
    expect(await createSpendGuardJobs(deps, { envName }).guard.handler({})).toEqual({ skipped: envName });
    expect((await dbs.owner.select().from(client).where(eq(client.id, IDS.clientA1)))[0]!.spendPausedAt).toBeNull();
  });

  it('runs the guard in dev and returns the summary', async () => {
    await dbs.owner.insert(llmCall).values({ agencyId: IDS.agencyA, clientId: IDS.clientA1, task: 't', provider: 'openrouter', model: 'm', inputTokens: 1, outputTokens: 1, costUsd: 99, latencyMs: 1, ok: true });
    expect(await createSpendGuardJobs(deps, { envName: 'dev' }).guard.handler({})).toMatchObject({ reached: 1, paused: 1, lifted: 0, rolledOver: 0, spike: 'ok' });
  });
});
