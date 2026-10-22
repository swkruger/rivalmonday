import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captureException = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureException }));

const { reportError } = await import('./report-error');

describe('reportError', () => {
  beforeEach(() => {
    captureException.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('captures a client-side error to Sentry once, tagged with where', () => {
    const error = new Error('boom');
    reportError(error, 'page');
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(error, { tags: { where: 'page' } });
  });

  it('tags the global boundary as global', () => {
    reportError(new Error('root layout'), 'global');
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { where: 'global' } });
  });

  it('leaves a server error (has a digest) to onRequestError, so it is reported once', () => {
    reportError(Object.assign(new Error('server render'), { digest: '123' }), 'page');
    expect(captureException).not.toHaveBeenCalled();
  });

  it('logs to the console outside production only', () => {
    vi.stubEnv('NODE_ENV', 'development');
    reportError(new Error('dev'), 'page');
    expect(console.error).toHaveBeenCalledTimes(1);
    vi.stubEnv('NODE_ENV', 'production');
    reportError(new Error('prod'), 'page');
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('never throws when Sentry does', () => {
    captureException.mockImplementation(() => {
      throw new Error('sentry down');
    });
    expect(() => reportError(new Error('x'), 'page')).not.toThrow();
  });
});
