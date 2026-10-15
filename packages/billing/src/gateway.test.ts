import { describe, expect, it } from 'vitest';
import { type DbEnvName, type GatewayEnv, type GatewayMode, gatewayFor, gatewayMode, usesFakeGateway } from './gateway';

const KEY = { STRIPE_SECRET_KEY: 'sk_test_x' };

describe('gatewayFor selection (R27)', () => {
  it.each([
    ['no key, dev', {}, 'dev', 'none'],
    ['blank key, dev', { STRIPE_SECRET_KEY: '  ' }, 'dev', 'none'],
    ['no key, NODE_ENV=production', { NODE_ENV: 'production' }, 'dev', 'none'],
    ['key, dev', KEY, 'dev', 'real'],
    ['key, production', { ...KEY, NODE_ENV: 'production' }, 'dev', 'real'],
    ['no key, demo', {}, 'demo', 'fake'],
    ['key, demo', KEY, 'demo', 'fake'],
    ['key, test db', KEY, 'test', 'fake'],
    ['no key, test db', {}, 'test', 'fake'],
    ['key, NODE_ENV=test', { ...KEY, NODE_ENV: 'test' }, 'dev', 'fake'],
    ['no key, VITEST', { VITEST: 'true' }, 'dev', 'fake'],
    ['key, VITEST', { ...KEY, VITEST: 'true' }, 'dev', 'fake'],
    ['E2E flag under next start', { BILLING_FAKE_GATEWAY: '1', NODE_ENV: 'production' }, 'dev', 'fake'],
    ['E2E flag wins over a key', { ...KEY, BILLING_FAKE_GATEWAY: '1' }, 'dev', 'fake'],
    ['E2E flag, other value', { BILLING_FAKE_GATEWAY: 'yes' }, 'dev', 'none'],
  ] as [string, GatewayEnv, DbEnvName, GatewayMode][])('%s', (_n, env, envName, mode) => {
    expect(gatewayMode(env, envName)).toBe(mode);
    expect(usesFakeGateway(env, envName)).toBe(mode === 'fake');
  });

  it('returns a recording fake, the Stripe gateway, or null (billing not configured)', () => {
    expect('calls' in gatewayFor({}, 'demo')!).toBe(true);
    expect('calls' in gatewayFor(KEY, 'dev')!).toBe(false);
    expect(gatewayFor({}, 'dev')).toBeNull();
  });
});
