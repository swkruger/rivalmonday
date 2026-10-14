import { describe, expect, it } from 'vitest';
import { type DbEnvName, type GatewayEnv, gatewayFor, usesFakeGateway } from './gateway';

const KEY = { STRIPE_SECRET_KEY: 'sk_test_x' };

describe('gatewayFor selection', () => {
  it.each([
    ['no key', {}, 'dev', true],
    ['blank key', { STRIPE_SECRET_KEY: '  ' }, 'dev', true],
    ['key, dev', KEY, 'dev', false],
    ['key, demo', KEY, 'demo', true],
    ['key, test db', KEY, 'test', true],
    ['key, NODE_ENV=test', { ...KEY, NODE_ENV: 'test' }, 'dev', true],
    ['key, VITEST', { ...KEY, VITEST: 'true' }, 'dev', true],
  ] as [string, GatewayEnv, DbEnvName, boolean][])('%s -> fake=%s', (_n, env, envName, fake) => {
    expect(usesFakeGateway(env, envName)).toBe(fake);
  });

  it('returns a recording fake without a key and the Stripe gateway with one', () => {
    expect('calls' in gatewayFor({}, 'dev')).toBe(true);
    expect('calls' in gatewayFor(KEY, 'dev')).toBe(false);
  });
});
