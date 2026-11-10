import * as Sentry from '@sentry/node';
import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { CITATION_SPACING_SECONDS, createCitationJobs } from './citations';

vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));

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

  it('client job: a manual runId is passed to the audit', async () => {
    const deps = {
      vendorsConfigured: () => true,
      runCitationAudit: vi.fn(async () => ({ runId: 'r9', status: 'done', calls: 1, usd: 0 })),
      diffCitations: vi.fn(async () => ({ ran: true, changeIds: [] })),
      recommendForCitations: vi.fn(async () => ({ outcome: 'skipped' })),
    } as unknown as WorkerDeps;
    const id = '00000000-0000-4000-8000-0000000000e1';
    await createCitationJobs(deps, queue()).client.handler({ clientId: 'c1', runId: id });
    expect(deps.runCitationAudit).toHaveBeenCalledWith('c1', { runId: id });
  });

  it('client job: a manual runId without vendors fails the run row and runs nothing', async () => {
    const deps = { vendorsConfigured: () => false, failCitationRun: vi.fn(async () => {}), runCitationAudit: vi.fn() } as unknown as WorkerDeps;
    const id = '00000000-0000-4000-8000-0000000000e1';
    await createCitationJobs(deps, queue()).client.handler({ clientId: 'c1', runId: id });
    expect(deps.failCitationRun).toHaveBeenCalledWith(id, AT);
    expect(deps.runCitationAudit).not.toHaveBeenCalled();
  });

  it('client job: a done run is diffed and each change is tagged', async () => {
    const deps = {
      runCitationAudit: vi.fn(async () => ({ runId: 'r1', status: 'done', calls: 4, usd: 0.016 })),
      diffCitations: vi.fn(async () => ({ ran: true, changeIds: ['ch1', 'ch2'] })),
      recommendForCitations: vi.fn(async () => ({ outcome: 'created' })),
    } as unknown as WorkerDeps;
    const q = queue();
    const jobs = createCitationJobs(deps, q);
    await jobs.client.handler({ clientId: 'c1' });
    expect(deps.diffCitations).toHaveBeenCalledWith('r1');
    expect(deps.recommendForCitations).toHaveBeenCalledWith('c1');
    expect(q.enqueueTag.mock.calls).toEqual([['ch1'], ['ch2']]);
    expect(jobs.client.queue).toMatchObject({ retryLimit: 0, policy: 'short' });
  });

  it('client job: capped is diffed too; failed and skipped are not', async () => {
    const diffCitations = vi.fn(async () => ({ ran: true, changeIds: [] }));
    const recommendForCitations = vi.fn(async () => ({ outcome: 'skipped' }));
    const run = (status: string, runId: string | null) => ({ runCitationAudit: vi.fn(async () => ({ runId, status, calls: 0, usd: 0 })), diffCitations, recommendForCitations }) as unknown as WorkerDeps;
    const q = queue();
    await createCitationJobs(run('capped', 'r2'), q).client.handler({ clientId: 'c1' });
    expect(diffCitations).toHaveBeenCalledTimes(1);
    expect(recommendForCitations).toHaveBeenCalledTimes(1);
    await createCitationJobs(run('failed', 'r3'), q).client.handler({ clientId: 'c1' });
    await createCitationJobs(run('skipped', null), q).client.handler({ clientId: 'c1' });
    expect(diffCitations).toHaveBeenCalledTimes(1);
    expect(recommendForCitations).toHaveBeenCalledTimes(1);
  });

  it('client job: a recommendation failure does not fail the job', async () => {
    const deps = {
      runCitationAudit: vi.fn(async () => ({ runId: 'r1', status: 'done', calls: 1, usd: 0 })),
      diffCitations: vi.fn(async () => ({ ran: true, changeIds: [] })),
      recommendForCitations: vi.fn(async () => { throw new Error('boom'); }),
    } as unknown as WorkerDeps;
    await expect(createCitationJobs(deps, queue()).client.handler({ clientId: 'c1' })).resolves.toBeUndefined();
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }), { tags: { job: 'citation-audit-client', stage: 'recommendation' }, extra: { clientId: 'c1' } });
  });
});
