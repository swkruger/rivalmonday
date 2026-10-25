import { afterEach, describe, expect, it, vi } from 'vitest';
import { healthState } from '../health';
import { workerLog } from '../log';
import { createHeartbeatJob } from './heartbeat';

const sample = async () => ({ dbConnections: 7, dbMaxConnections: 100 });

afterEach(() => {
  vi.restoreAllMocks();
  Object.assign(healthState, { lastHeartbeatAt: null, queueGrantsOk: null });
});

describe('heartbeat job', () => {
  it('is importable without side effects and has the expected name and schedule', () => {
    const job = createHeartbeatJob({ ensureGrants: async () => {}, sample });
    expect(job.name).toBe('system-heartbeat');
    expect(job.cron).toBe('*/5 * * * *');
  });

  it('accepts an empty payload and the cron marker', () => {
    const job = createHeartbeatJob({ ensureGrants: async () => {}, sample });
    expect(() => job.schema.parse({})).not.toThrow();
    expect(job.schema.parse({ _cron: true })).toEqual({ _cron: true });
  });

  it('heartbeat retries grants and reports failed', async () => {
    vi.spyOn(workerLog, 'error').mockImplementation(() => {});
    const ensureGrants = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('permission denied')).mockResolvedValueOnce(undefined);
    const job = createHeartbeatJob({ ensureGrants, sample });
    expect(await job.handler({})).toMatchObject({ queueGrants: 'failed' });
    expect(healthState.queueGrantsOk).toBe(false);
    expect(healthState.lastHeartbeatAt).toBeInstanceOf(Date);
    expect(workerLog.error).toHaveBeenCalledTimes(1);
    // The next beat tries again and recovers.
    expect(await job.handler({})).toMatchObject({ queueGrants: 'ok' });
    expect(healthState.queueGrantsOk).toBe(true);
    expect(ensureGrants).toHaveBeenCalledTimes(2);
  });

  it('heartbeat output carries rssMb and dbConnections', async () => {
    const job = createHeartbeatJob({ ensureGrants: async () => {}, sample });
    const out = await job.handler({});
    expect(out).toEqual({ queueGrants: 'ok', rssMb: expect.any(Number), dbConnections: 7, dbMaxConnections: 100 });
    expect((out as { rssMb: number }).rssMb).toBeGreaterThan(0);
  });

  it('a failing connection sample does not fail the beat', async () => {
    vi.spyOn(workerLog, 'warn').mockImplementation(() => {});
    const job = createHeartbeatJob({ ensureGrants: async () => {}, sample: async () => { throw new Error('db down'); } });
    expect(await job.handler({})).toMatchObject({ queueGrants: 'ok', dbConnections: null, dbMaxConnections: null });
    expect(healthState.lastHeartbeatAt).toBeInstanceOf(Date);
  });
});
