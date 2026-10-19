import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { client, runbook } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { loadVerticalPack } from '@cs/verticals';
import { eq } from 'drizzle-orm';
import { afterAll } from 'vitest';
import { createRunbookJobs, runRunbookTailor } from './runbooks';

const ID = '00000000-0000-4000-8000-0000000000a1';

describe('runbook-tailor job', () => {
  it('declares name and a short queue with one retry', () => {
    const { tailor } = createRunbookJobs({} as WorkerDeps, { envName: 'dev' });
    expect(tailor).toMatchObject({ name: 'runbook-tailor', queue: { policy: 'short', retryLimit: 1 } });
  });
  it.each(['demo', 'test'] as const)('skips in %s', async (envName) => {
    const tailorRunbook = vi.fn();
    const { tailor } = createRunbookJobs({ tailorRunbook } as unknown as WorkerDeps, { envName });
    expect(await tailor.handler({ clientId: ID })).toEqual({ skipped: envName });
    expect(tailorRunbook).not.toHaveBeenCalled();
  });
  it('delegates to deps in dev', async () => {
    const tailorRunbook = vi.fn(async () => ({ status: 'done' as const, rejected: [] }));
    const { tailor } = createRunbookJobs({ tailorRunbook } as unknown as WorkerDeps, { envName: 'dev' });
    expect(await tailor.handler({ clientId: ID })).toEqual({ status: 'done', rejected: [] });
    expect(tailorRunbook).toHaveBeenCalledWith(ID);
  });
});

describe('runRunbookTailor', () => {
  const dbs = openTestDbs();
  afterAll(() => dbs.closeAll());
  it('writes the untailored copy as failed when the AI client cannot be built', async () => {
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
    await dbs.owner.delete(runbook);
    await dbs.owner.update(client).set({ verticalId: 'hvac_plumbing' }).where(eq(client.id, IDS.clientA1));
    const hvac = await loadVerticalPack('hvac_plumbing');
    const generic = await loadVerticalPack('generic');
    const out = await runRunbookTailor({ db: dbs.service, getAi: async () => { throw new Error('OPENROUTER_API_KEY missing'); }, packs: async () => hvac, generic: async () => generic }, IDS.clientA1);
    expect(out.status).toBe('failed');
    const [rb] = await dbs.owner.select().from(runbook).where(eq(runbook.clientId, IDS.clientA1));
    expect(rb?.tailorStatus).toBe('failed');
  });
});
