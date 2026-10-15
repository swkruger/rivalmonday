import { describe, expect, it } from 'vitest';
import { DEMO_CONNECT_ACCOUNTS, DEMO_CONNECT_SUBSCRIPTIONS, demoConnectIds } from './demo-connect';
import type { FakeGateway } from './fake-gateway';
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

  it('only the E2E flag opts the fake into finishing onboarding on a re-link (final wave)', async () => {
    const relink = async (g: FakeGateway) => {
      const { accountId } = await g.createAccountLink({ refreshUrl: 'r', returnUrl: 'x' });
      await g.createAccountLink({ accountId, refreshUrl: 'r', returnUrl: 'x' });
      return (await g.getAccount({ stripeAccount: accountId })).chargesEnabled;
    };
    expect(await relink(gatewayFor({ BILLING_FAKE_GATEWAY: '1', NODE_ENV: 'production' }, 'dev') as FakeGateway)).toBe(true);
    expect(await relink(gatewayFor({ BILLING_FAKE_GATEWAY: '1' }, 'test') as FakeGateway)).toBe(true);
    expect(await relink(gatewayFor({}, 'demo') as FakeGateway)).toBe(false);
    expect(await relink(gatewayFor({}, 'test') as FakeGateway)).toBe(false);
  });

  it('the DEMO fake knows the seeded Connect accounts, prices and subscriptions; other fakes start empty (final wave)', async () => {
    const g = gatewayFor({}, 'demo') as FakeGateway;
    for (const k of DEMO_CONNECT_ACCOUNTS) {
      const stripeAccount = demoConnectIds.account(k);
      expect(await g.getAccount({ stripeAccount })).toMatchObject({ chargesEnabled: true, detailsSubmitted: true });
      await expect(g.createConnectedCheckout({ stripeAccount, priceId: demoConnectIds.defaultPrice(k), customerEmail: 'o@x.test', successUrl: 's', cancelUrl: 'c' })).resolves.toMatchObject({ id: expect.any(String) });
    }
    for (const s of DEMO_CONNECT_SUBSCRIPTIONS) {
      const stripeAccount = demoConnectIds.account(s.account);
      expect(await g.getConnectedSubscription({ stripeAccount, subscriptionId: demoConnectIds.subscription(s.key) })).toMatchObject({ status: s.status, unitAmountCents: s.cents, customerId: demoConnectIds.customer(s.key) });
    }
    expect((gatewayFor({}, 'test') as FakeGateway).connectedAccounts.size).toBe(0);
  });
});
