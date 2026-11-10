import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { CITATION_SPACING_SECONDS, createCitationJobs } from './citations';

const AT = new Date('2026-11-10T09:00:00Z');
const queue = () => ({ enqueueClient: vi.fn(async () => {}), enqueueTag: vi.fn(async () => {}), now: () => AT });

describe('citation jobs', () => {
  it('cron: sweeps stale runs, enqueues each due client spaced with the day singleton key', async () => {
    const deps = {
      vendorsConfigured: () => true,
      failStaleCitationRuns: vi.fn(async () => 0),
      listCitationDueClients: vi.fn(async () => ['c1', 'c2', 'c3']),
    } as unknown as WorkerDeps;
    const q = queue();
    const jobs = createCitationJobs(deps, q);
    await jobs.audit.handler({});
    expect(jobs.audit.cron).toBe('0 9 * * *');
    expect(deps.failStaleCitationRuns).toHaveBeenCalledWith(AT);
    expect(q.enqueueClient.mock.calls).toEqual([
      ['c1', { startAfter: 0, singletonKey: 'citation:c1:2026-11-10' }],
      ['c2', { startAfter: CITATION_SPACING_SECONDS, singletonKey: 'citation:c2:2026-11-10' }],
      ['c3', { startAfter: 2 * CITATION_SPACING_SECONDS, singletonKey: 'citation:c3:2026-11-10' }],
    ]);
    expect(CITATION_SPACING_SECONDS).toBe(60);
  });

  it('vendors unconfigured: nothing is swept or enqueued', async () => {
    const deps = { vendorsConfigured: () => false, failStaleCitationRuns: vi.fn(), listCitationDueClients: vi.fn(async () => ['c1']) } as unknown as WorkerDeps;
    const q = queue();
    await createCitationJobs(deps, q).audit.handler({});
    expect(deps.listCitationDueClients).not.toHaveBeenCalled();
    expect(q.enqueueClient).not.toHaveBeenCalled();
  });

  it('client job: a done run is diffed and each change is tagged', async () => {
    const deps = {
      runCitationAudit: vi.fn(async () => ({ runId: 'r1', status: 'done', calls: 4, usd: 0.016 })),
      diffCitations: vi.fn(async () => ({ ran: true, changeIds: ['ch1', 'ch2'] })),
    } as unknown as WorkerDeps;
    const q = queue();
    const jobs = createCitationJobs(deps, q);
    await jobs.client.handler({ clientId: 'c1' });
    expect(deps.diffCitations).toHaveBeenCalledWith('r1');
    expect(q.enqueueTag.mock.calls).toEqual([['ch1'], ['ch2']]);
    expect(jobs.client.queue).toMatchObject({ retryLimit: 0, policy: 'short' });
  });

  it('client job: capped is diffed too; failed and skipped are not', async () => {
    const diffCitations = vi.fn(async () => ({ ran: true, changeIds: [] }));
    const run = (status: string, runId: string | null) => ({ runCitationAudit: vi.fn(async () => ({ runId, status, calls: 0, usd: 0 })), diffCitations }) as unknown as WorkerDeps;
    const q = queue();
    await createCitationJobs(run('capped', 'r2'), q).client.handler({ clientId: 'c1' });
    expect(diffCitations).toHaveBeenCalledTimes(1);
    await createCitationJobs(run('failed', 'r3'), q).client.handler({ clientId: 'c1' });
    await createCitationJobs(run('skipped', null), q).client.handler({ clientId: 'c1' });
    expect(diffCitations).toHaveBeenCalledTimes(1);
  });
});
