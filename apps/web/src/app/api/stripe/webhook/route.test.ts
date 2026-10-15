import { agencyBilling, plan, stripeEvent } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

vi.mock('@/server/db', () => ({ dbs: () => ({ app: dbs.app, service: dbs.service }) }));
const stripeEnv = vi.hoisted(() => ({ current: { VITEST: 'true' } as Record<string, string | undefined> }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ stripe: stripeEnv.current }) }));

const { POST } = await import('./route');

const AGENCY = IDS.agencyA;
const T0 = 1_790_000_000;
const body = (id: string, type: string, object: Record<string, unknown>) => JSON.stringify({ id, type, created: T0, data: { object: { customer: 'cus_1', ...object } } });
const post = (raw: string, sig?: string) =>
  POST(new Request('http://localhost/api/stripe/webhook', { method: 'POST', headers: sig ? { 'stripe-signature': sig } : {}, body: raw }));

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const [p] = await dbs.owner
    .insert(plan)
    .values({ code: 'standard', version: 1, name: 'Standard', basePriceCents: 22900, includedSeats: 3, seatPriceCents: 9900, trialDays: 30, isCurrent: true, createdBy: 'test' })
    .returning({ id: plan.id });
  await dbs.owner.insert(agencyBilling).values({ agencyId: AGENCY, state: 'active', planId: p!.id, stripeCustomerId: 'cus_1' });
  stripeEnv.current = { VITEST: 'true' };
  vi.restoreAllMocks();
});

describe('POST /api/stripe/webhook', () => {
  it('400 for a missing or bad signature, nothing persisted', async () => {
    expect((await post(body('e1', 'invoice.paid', {}))).status).toBe(400);
    expect((await post(body('e1', 'invoice.paid', {}), 'nope')).status).toBe(400);
    expect(await dbs.owner.select().from(stripeEvent)).toHaveLength(0);
  });

  it('404 on a keyless production deployment (the fake gateway must never accept forged events)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const res = await post(body('e1', 'invoice.payment_failed', {}), 'fake-sig');
      expect(res.status).toBe(404);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(await dbs.owner.select().from(stripeEvent)).toHaveLength(0);
    const [r] = await dbs.owner.select().from(agencyBilling).where(eq(agencyBilling.agencyId, AGENCY));
    expect(r!.state).toBe('active');
  });

  it('200 with the handler result for a valid (fake) signature, then duplicate', async () => {
    const raw = body('e1', 'invoice.payment_failed', {});
    const res = await post(raw, 'fake-sig');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, result: 'processed' });
    const [r] = await dbs.owner.select().from(agencyBilling).where(eq(agencyBilling.agencyId, AGENCY));
    expect(r!.state).toBe('past_due');
    expect(await (await post(raw, 'fake-sig')).json()).toEqual({ received: true, result: 'duplicate' });
  });

  it('404 when billing is not configured (no key, not DEMO/TEST: no gateway, R27)', async () => {
    stripeEnv.current = {};
    expect((await post(body('e1', 'invoice.payment_failed', {}), 'fake-sig')).status).toBe(404);
    expect(await dbs.owner.select().from(stripeEvent)).toHaveLength(0);
  });

  it('a real key without STRIPE_WEBHOOK_SECRET logs a misconfiguration line and fails (Stripe retries)', async () => {
    stripeEnv.current = { STRIPE_SECRET_KEY: 'sk_test_x' };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await post(body('e1', 'invoice.payment_failed', {}), 't=1,v1=x');
    expect(res.status).toBe(500);
    expect(err).toHaveBeenCalledWith('[stripe] webhook misconfigured: STRIPE_WEBHOOK_SECRET is not set');
    expect(JSON.stringify(err.mock.calls)).not.toContain('sk_test_x');
  });

  it('500 when the handler throws, with the error recorded on the event row', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await post(body('e2', 'checkout.session.completed', { subscription: 'sub_missing' }), 'fake-sig');
    expect(res.status).toBe(500);
    expect(err).toHaveBeenCalledWith('[stripe] webhook failed', 'e2', 'checkout.session.completed');
    expect(JSON.stringify(err.mock.calls)).not.toContain('sub_missing');
    expect(JSON.stringify(await res.json())).not.toContain('sub_missing');
    const [rec] = await dbs.owner.select().from(stripeEvent).where(eq(stripeEvent.id, 'e2'));
    expect(rec).toMatchObject({ processedAt: null, error: expect.any(String) });
  });
});
