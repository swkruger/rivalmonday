import { agencyConnect, clientBilling, stripeConnectEvent } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

vi.mock('@/server/db', () => ({ dbs: () => ({ app: dbs.app, service: dbs.service }) }));
const stripeEnv = vi.hoisted(() => ({ current: { VITEST: 'true' } as Record<string, string | undefined> }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ stripe: stripeEnv.current }) }));

const { POST } = await import('./route');

const T0 = 1_790_000_000;
const body = (id: string, type: string, object: Record<string, unknown>, account = 'acct_a') => JSON.stringify({ id, type, created: T0, account, data: { object } });
const post = (raw: string, sig?: string) =>
  POST(new Request('http://localhost/api/stripe/connect-webhook', { method: 'POST', headers: sig ? { 'stripe-signature': sig } : {}, body: raw }));
const billing = async (id: string = IDS.clientA1) => (await dbs.owner.select().from(clientBilling).where(eq(clientBilling.clientId, id)))[0]!;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.insert(agencyConnect).values([
    { agencyId: IDS.agencyA, stripeAccountId: 'acct_a', status: 'connected', chargesEnabled: true, connectedAt: new Date() },
    { agencyId: IDS.agencyB, stripeAccountId: 'acct_b', status: 'connected', chargesEnabled: true, connectedAt: new Date() },
  ]);
  await dbs.owner.insert(clientBilling).values({ clientId: IDS.clientA1, agencyId: IDS.agencyA, state: 'active', enabled: true, stripeSubscriptionId: 'sub_1', stripeCustomerId: 'cus_1' });
  stripeEnv.current = { VITEST: 'true' };
  vi.restoreAllMocks();
});

describe('POST /api/stripe/connect-webhook', () => {
  it('400 for a missing or bad signature, nothing persisted', async () => {
    expect((await post(body('e1', 'invoice.payment_failed', { subscription: 'sub_1' }))).status).toBe(400);
    expect((await post(body('e1', 'invoice.payment_failed', { subscription: 'sub_1' }), 'nope')).status).toBe(400);
    expect(await dbs.owner.select().from(stripeConnectEvent)).toHaveLength(0);
    expect((await billing()).state).toBe('active');
  });

  it('404 on a keyless production deployment (the fake gateway must never accept forged events)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      expect((await post(body('e1', 'invoice.payment_failed', { subscription: 'sub_1' }), 'fake-sig')).status).toBe(404);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(await dbs.owner.select().from(stripeConnectEvent)).toHaveLength(0);
    expect((await billing()).state).toBe('active');
  });

  it('404 when billing is not configured (no key, not DEMO/TEST: no gateway, A5/R27)', async () => {
    stripeEnv.current = {};
    expect((await post(body('e1', 'invoice.payment_failed', {}), 'fake-sig')).status).toBe(404);
    expect(await dbs.owner.select().from(stripeConnectEvent)).toHaveLength(0);
  });

  it('200 with the handler result for a valid (fake) signature, then duplicate', async () => {
    const raw = body('e1', 'invoice.payment_failed', { subscription: 'sub_1' });
    const res = await post(raw, 'fake-sig');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, result: 'processed' });
    expect((await billing()).state).toBe('payment_needed');
    expect(await (await post(raw, 'fake-sig')).json()).toEqual({ received: true, result: 'duplicate' });
  });

  it('an event on another agency account never touches this agency client', async () => {
    const res = await post(body('e1', 'invoice.payment_failed', { subscription: 'sub_1' }, 'acct_b'), 'fake-sig');
    expect(await res.json()).toEqual({ received: true, result: 'ignored' });
    expect((await billing()).state).toBe('active');
  });

  it('a real key without STRIPE_CONNECT_WEBHOOK_SECRET logs a fixed misconfiguration line and fails (Stripe retries)', async () => {
    stripeEnv.current = { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_platform' };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await post(body('e1', 'invoice.payment_failed', {}), 't=1,v1=x');
    expect(res.status).toBe(500);
    expect(err).toHaveBeenCalledWith('[stripe] connect webhook misconfigured: STRIPE_CONNECT_WEBHOOK_SECRET is not set');
    expect(JSON.stringify(err.mock.calls)).not.toContain('sk_test_x');
    expect(JSON.stringify(err.mock.calls)).not.toContain('whsec_platform');
  });

  it('500 when the handler throws, with the error recorded on the event row and no payload in logs', async () => {
    await dbs.owner.update(clientBilling).set({ state: 'invited', checkoutSessionId: 'cs_1', stripeSubscriptionId: null });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await post(body('e2', 'checkout.session.completed', { id: 'cs_1', customer: 'cus_zz', subscription: 'sub_missing' }), 'fake-sig');
    expect(res.status).toBe(500);
    expect(err).toHaveBeenCalledWith('[stripe] connect webhook failed', 'e2', 'checkout.session.completed');
    expect(JSON.stringify(err.mock.calls)).not.toContain('sub_missing');
    expect(JSON.stringify(await res.json())).not.toContain('sub_missing');
    const [rec] = await dbs.owner.select().from(stripeConnectEvent).where(eq(stripeConnectEvent.id, 'e2'));
    expect(rec).toMatchObject({ processedAt: null, error: expect.any(String) });
  });
});
