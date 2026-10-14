import { agencyBilling } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createBillingJobs } from './billing-daily';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
afterEach(() => vi.restoreAllMocks());

const deps = { serviceDb: () => dbs.service } as unknown as WorkerDeps;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('billing-daily', () => {
  it('declares name, 02:30 UTC cron and an empty payload schema', () => {
    const { daily } = createBillingJobs(deps, { envName: 'dev', env: {} });
    expect(daily).toMatchObject({ name: 'billing-daily', cron: '30 2 * * *' });
    expect(daily.schema.safeParse({}).success).toBe(true);
  });

  it.each(['demo', 'test'] as const)('returns early in %s without touching billing', async (envName) => {
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'trialing', trialEndsAt: new Date('2020-01-01T00:00:00Z') });
    const { daily } = createBillingJobs(deps, { envName, env: {} });
    expect(await daily.handler({})).toEqual({ skipped: envName });
    expect((await dbs.owner.select().from(agencyBilling).where(eq(agencyBilling.agencyId, IDS.agencyA)))[0]!.state).toBe('trialing');
  });

  it('runs the daily maintenance in dev (fake gateway under test) and returns the counts', async () => {
    await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'trialing', trialEndsAt: new Date('2020-01-01T00:00:00Z') });
    const { daily } = createBillingJobs(deps, { envName: 'dev', env: {}, now: () => new Date('2026-10-14T02:30:00Z') });
    expect(await daily.handler({})).toEqual({ transitions: 1, reminders: 0, seatRetries: 0, drift: 0 });
    expect((await dbs.owner.select().from(agencyBilling).where(eq(agencyBilling.agencyId, IDS.agencyA)))[0]!.state).toBe('past_due');
  });
});
