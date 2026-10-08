import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createProspectJobs } from './prospects';

describe('prospect-snapshot job', () => {
  it('is single-shot, deduped per client, and runs the snapshot with the job data', async () => {
    const runProspectSnapshot = vi.fn(async () => ({ status: 'ready' as const }));
    const { snapshot } = createProspectJobs({ runProspectSnapshot } as unknown as WorkerDeps);
    expect(snapshot.name).toBe('prospect-snapshot');
    expect(snapshot.queue).toMatchObject({ retryLimit: 0, policy: 'short' });
    const data = { clientId: '00000000-0000-4000-8000-0000000000a2', reportId: '00000000-0000-4000-8000-000000000001' };
    await snapshot.handler(snapshot.schema.parse(data));
    expect(runProspectSnapshot).toHaveBeenCalledWith(data.clientId, data.reportId);
  });
});
