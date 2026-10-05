import { describe, expect, it, vi } from 'vitest';
import { type Boss, createBossQueue } from './queue';

function fakeBoss(opts: { startError?: Error } = {}): Boss {
  return {
    on: vi.fn(),
    start: vi.fn(async () => {
      if (opts.startError) throw opts.startError;
    }),
    send: vi.fn(async () => 'job-id'),
  };
}

describe('createBossQueue', () => {
  it('retries a fresh boss after a failed first start instead of wedging the process forever', async () => {
    const failing = fakeBoss({ startError: new Error('connection refused') });
    const working = fakeBoss();
    const launch = vi.fn().mockReturnValueOnce(failing).mockReturnValueOnce(working);
    const { enqueue } = createBossQueue(launch);

    // First enqueue surfaces the start failure...
    await expect(enqueue('brief-pdf', { briefId: 'b1' }, 'b1')).rejects.toThrow('connection refused');
    expect(launch).toHaveBeenCalledTimes(1);

    // ...but does not wedge the cache: the next enqueue launches and starts a fresh boss and succeeds.
    await expect(enqueue('brief-pdf', { briefId: 'b1' }, 'b1')).resolves.toBeUndefined();
    expect(launch).toHaveBeenCalledTimes(2);
    expect(working.send).toHaveBeenCalledWith('brief-pdf', { briefId: 'b1' }, { singletonKey: 'b1' });
    expect(failing.send).not.toHaveBeenCalled();
  });

  it('reuses the same started boss across concurrent and later successful calls', async () => {
    const working = fakeBoss();
    const launch = vi.fn().mockReturnValue(working);
    const { enqueue } = createBossQueue(launch);

    await Promise.all([enqueue('brief-pdf', { briefId: 'b1' }, 'b1'), enqueue('report-pdf', { reportId: 'r1' }, 'r1')]);
    await enqueue('brief-pdf', { briefId: 'b2' }, 'b2');

    expect(launch).toHaveBeenCalledTimes(1);
    expect(working.start).toHaveBeenCalledTimes(1);
    expect(working.send).toHaveBeenCalledTimes(3);
  });
});
