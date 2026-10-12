import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createAskJobs } from './ask';

const id = '00000000-0000-4000-8000-0000000000a1';

describe('ask jobs', () => {
  it('ask-starters generates for the client', async () => {
    const deps = { engineConfigured: () => true, generateAskStarters: vi.fn(async () => ['a', 'b', 'c', 'd']) } as unknown as WorkerDeps;
    const job = createAskJobs(deps).starters;
    await job.handler({ clientId: id });
    expect(deps.generateAskStarters).toHaveBeenCalledWith(id);
    expect(job.name).toBe('ask-starters');
    expect(job.schema.safeParse({ clientId: 'nope' }).success).toBe(false);
  });

  it('does nothing until the engine is configured', async () => {
    const deps = { engineConfigured: () => false, generateAskStarters: vi.fn() } as unknown as WorkerDeps;
    await createAskJobs(deps).starters.handler({ clientId: id });
    expect(deps.generateAskStarters).not.toHaveBeenCalled();
  });
});
