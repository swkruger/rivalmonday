import { describe, expect, it } from 'vitest';
import { syncPlanRefusal } from './billing-sync-plan-args';

describe('billing:sync-plan gateway guard (R27)', () => {
  it('runs only against real Stripe', () => {
    expect(syncPlanRefusal({ STRIPE_SECRET_KEY: 'sk_test_x' }, 'dev')).toBeNull();
  });

  it('refuses without a key (no gateway)', () => {
    expect(syncPlanRefusal({}, 'dev')).toMatch(/STRIPE_SECRET_KEY is not set/);
  });

  it.each([
    ['demo db', {}, 'demo'],
    ['test db', { STRIPE_SECRET_KEY: 'sk_test_x' }, 'test'],
    ['test run', { STRIPE_SECRET_KEY: 'sk_test_x', VITEST: 'true' }, 'dev'],
    ['E2E flag', { STRIPE_SECRET_KEY: 'sk_test_x', BILLING_FAKE_GATEWAY: '1' }, 'dev'],
  ] as const)('refuses when the fake gateway would be selected (%s): fake ids must never be stored', (_n, env, envName) => {
    expect(syncPlanRefusal(env, envName)).toMatch(/fake gateway/);
  });
});
