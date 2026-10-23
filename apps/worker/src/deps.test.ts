import { describe, expect, it, vi } from 'vitest';

const createAiFromEnv = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock('@cs/ai', async (orig) => ({ ...(await orig<typeof import('@cs/ai')>()), createAiFromEnv, loadAiConfigFile: async () => ({}) }));
import { createWorkerDeps, reviewsSkipReason } from './deps';

describe('reviewsSkipReason', () => {
  it('flags a missing REVIEWER_HASH_SALT', () => {
    expect(reviewsSkipReason({})).toMatch(/REVIEWER_HASH_SALT/);
  });

  it('flags a REVIEWER_HASH_SALT shorter than 32 characters', () => {
    expect(reviewsSkipReason({ REVIEWER_HASH_SALT: 'short' })).toMatch(/REVIEWER_HASH_SALT/);
  });

  it('is null once the salt is long enough', () => {
    expect(reviewsSkipReason({ REVIEWER_HASH_SALT: 's'.repeat(32) })).toBeNull();
  });
});

describe('aiGuard', () => {
  it('builds one shared guard for the daemon', () => {
    const deps = createWorkerDeps({ SERVICE_DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x' } as NodeJS.ProcessEnv);
    expect(deps.aiGuard()).toBe(deps.aiGuard());
    expect(typeof deps.aiGuard()!.assertAllowed).toBe('function');
  });

  it('the *-once CLIs opt out: no guard is built or passed to Ai', async () => {
    const env = { SERVICE_DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x' } as NodeJS.ProcessEnv;
    const off = createWorkerDeps(env, { aiGuard: false });
    expect(off.aiGuard()).toBeUndefined();
    createAiFromEnv.mockClear();
    await off.collectModelBatches().catch(() => undefined);
    expect(createAiFromEnv).toHaveBeenCalledTimes(1);
    expect((createAiFromEnv.mock.calls[0] as unknown[])[4]).toBeUndefined();
    const on = createWorkerDeps(env);
    createAiFromEnv.mockClear();
    await on.collectModelBatches().catch(() => undefined);
    expect((createAiFromEnv.mock.calls[0] as unknown[])[4]).toBe(on.aiGuard());
  });
});
