import * as Sentry from '@sentry/node';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Logger, LogContext } from '@cs/core/server';

vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  startSpan: vi.fn((_o: unknown, cb: () => unknown) => cb()),
  withMonitor: vi.fn((_slug: string, cb: () => unknown) => cb()),
}));

import { initWorkerSentry, runJob, workerSentryOptions } from './sentry';

function fakeLog() {
  const ctxs: LogContext[] = [];
  const error = vi.fn();
  const log: Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error, child: (c) => { ctxs.push(c); return log; } };
  return { log, ctxs, error };
}

beforeEach(() => vi.clearAllMocks());

describe('initWorkerSentry', () => {
  it('is false without a DSN and does not init', () => {
    expect(initWorkerSentry({})).toBe(false);
    expect(initWorkerSentry({ SENTRY_DSN: '  ' })).toBe(false);
    expect(Sentry.init).not.toHaveBeenCalled();
  });
  it('inits with release from SENTRY_RELEASE and redacting beforeSend', () => {
    expect(initWorkerSentry({ SENTRY_DSN: 'https://k@o.ingest.sentry.io/1', SENTRY_RELEASE: 'abc123' })).toBe(true);
    const opts = vi.mocked(Sentry.init).mock.calls[0]![0] as unknown as { release: string; beforeSend: (e: unknown) => { token: string } };
    expect(opts.release).toBe('abc123');
    expect(opts.beforeSend({ token: 'secret' }).token).toBe('[redacted]');
  });
  it('turns off v11 default data collection (no bodies, cookies or user info)', () => {
    const opts = workerSentryOptions('https://k@o.ingest.sentry.io/1', {});
    expect(opts.dataCollection).toMatchObject({ httpBodies: [], cookies: false, userInfo: false, urlQueryParams: false });
    expect(opts).not.toHaveProperty('sendDefaultPii');
  });
  it('beforeSend drops any request and user IP', () => {
    const opts = workerSentryOptions('https://k@o.ingest.sentry.io/1', {});
    const out = opts.beforeSend({ request: { data: 'pw' }, user: { id: 'u1', ip_address: '1.2.3.4' } } as never) as unknown as Record<string, unknown>;
    expect(out.request).toBeUndefined();
    expect(out.user).toEqual({ id: 'u1' });
  });
});

describe('runJob', () => {
  const job = { name: 'my-job' };
  it('rethrows and captures with job tags', async () => {
    const { log, error } = fakeLog();
    const boom = new Error('boom');
    await expect(runJob(job, 'j1', { clientId: 'c1' }, async () => { throw boom; }, log)).rejects.toBe(boom);
    expect(Sentry.captureException).toHaveBeenCalledWith(boom, { tags: { job: 'my-job', jobId: 'j1', clientId: 'c1' } });
    expect(error).toHaveBeenCalledTimes(1);
    expect(Sentry.startSpan).toHaveBeenCalledWith({ name: 'job.my-job', op: 'queue.process' }, expect.any(Function));
  });
  it('returns the handler result', async () => {
    const { log } = fakeLog();
    expect(await runJob(job, 'j1', {}, async () => ({ a: 1 }), log)).toEqual({ a: 1 });
  });
  it('uses withMonitor only for cron jobs', async () => {
    const { log } = fakeLog();
    await runJob(job, 'j1', {}, async () => {}, log);
    expect(Sentry.withMonitor).not.toHaveBeenCalled();
    await runJob({ name: 'cron-job', cron: '*/5 * * * *' }, 'j2', {}, async () => {}, log);
    expect(Sentry.withMonitor).toHaveBeenCalledWith('cron-job', expect.any(Function), {
      schedule: { type: 'crontab', value: '*/5 * * * *' }, checkinMargin: 5, maxRuntime: 30,
    });
  });
  it('child logger carries agencyId/clientId but no other payload field', async () => {
    const { log, ctxs } = fakeLog();
    await runJob(job, 'j1', { agencyId: 'a1', clientId: 'c1', email: 'x@y.com', prompt: 'p', other: 'z', n: 5 }, async () => {}, log);
    expect(ctxs).toEqual([{ job: 'my-job', jobId: 'j1', agencyId: 'a1', clientId: 'c1' }]);
    await runJob(job, 'j2', { clientId: 7 }, async () => {}, log);
    expect(ctxs[1]).toEqual({ job: 'my-job', jobId: 'j2' });
  });
});
