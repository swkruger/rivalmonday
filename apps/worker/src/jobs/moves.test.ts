import { describe, expect, it, vi } from 'vitest';
import type { WorkerDeps } from '../deps';
import { createMovesJobs } from './moves';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('moves jobs', () => {
  it('runs nightly and enqueues every client that tracks a competitor', async () => {
    const deps = { listMoveClients: vi.fn(async () => [U(1), U(2)]) } as unknown as WorkerDeps;
    const enqueueMovesClient = vi.fn(async (_id: string) => {});
    const jobs = createMovesJobs(deps, { enqueueMovesClient });
    expect(jobs.nightly.cron).toBe('30 4 * * *');
    await jobs.nightly.handler({});
    expect(enqueueMovesClient.mock.calls).toEqual([[U(1)], [U(2)]]);
  });

  it('updates one client per job', async () => {
    const deps = { updateMoves: vi.fn(async () => ({ opened: 1, updated: 0, fading: 0, closed: 0 })) } as unknown as WorkerDeps;
    const jobs = createMovesJobs(deps, { enqueueMovesClient: vi.fn() });
    await jobs.client.handler({ clientId: U(3) });
    expect(deps.updateMoves).toHaveBeenCalledWith(U(3));
    expect(() => jobs.client.schema.parse({ clientId: 'x' })).toThrow();
  });
});
