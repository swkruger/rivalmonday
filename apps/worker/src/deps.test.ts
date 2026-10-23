import { describe, expect, it } from 'vitest';
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
    const deps = createWorkerDeps({ SERVICE_DATABASE_URL: 'postgres://u:p@127.0.0.1:1/x' } as NodeJS.ProcessEnv, { aiGuard: false });
    expect(deps.aiGuard()).toBeUndefined();
  });
});
