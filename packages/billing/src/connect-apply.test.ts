import { agency, agencyConnect, billingNotice, clientBilling } from '@cs/db';
import { IDS, openTestDbs } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { ClientBillingSignal } from './client-billing-state';
import { applyClientBillingSignal, disconnectAgencyConnect } from './connect-apply';
import { resetBilling } from './test-util';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const disconnect = (id: string = IDS.agencyA) => dbs.service.transaction((tx) => disconnectAgencyConnect(tx, id, 'user-1'));
const connectRow = async (id: string = IDS.agencyA) => (await dbs.owner.select().from(agencyConnect).where(eq(agencyConnect.agencyId, id)))[0]!;
const states = async () => Object.fromEntries((await dbs.owner.select().from(clientBilling)).map((r) => [r.clientId, r.state]));

beforeEach(async () => {
  await resetBilling(dbs.owner);
  await dbs.owner.insert(agencyConnect).values({ agencyId: IDS.agencyA, stripeAccountId: 'acct_1', status: 'connected', chargesEnabled: true, connectedAt: new Date() });
  await dbs.owner.insert(clientBilling).values([
    { clientId: IDS.clientA1, agencyId: IDS.agencyA, state: 'active' },
    { clientId: IDS.clientA2, agencyId: IDS.agencyA, state: 'off' },
  ]);
});

describe('disconnectAgencyConnect', () => {
  it('marks the connection disconnected, disables charges and moves non-off client billing to disconnected', async () => {
    expect(await disconnect()).toEqual({ changed: true });
    const c = await connectRow();
    expect(c).toMatchObject({ status: 'disconnected', chargesEnabled: false, stripeAccountId: 'acct_1' });
    expect(c.disconnectedAt).toBeInstanceOf(Date);
    expect(await states()).toEqual({ [IDS.clientA1]: 'disconnected', [IDS.clientA2]: 'off' });
  });

  it('is idempotent: a second call changes nothing', async () => {
    await disconnect();
    const first = await connectRow();
    expect(await disconnect()).toEqual({ changed: false });
    expect((await connectRow()).disconnectedAt).toEqual(first.disconnectedAt);
  });

  it('returns changed:false when the agency has no connection and leaves other agencies alone', async () => {
    expect(await disconnect(IDS.agencyB)).toEqual({ changed: false });
    expect((await connectRow()).status).toBe('connected');
    expect(await states()).toMatchObject({ [IDS.clientA1]: 'active' });
  });
});

describe('applyClientBillingSignal', () => {
  const apply = (clientId: string, s: ClientBillingSignal, now?: Date) => dbs.service.transaction((tx) => applyClientBillingSignal(tx, clientId, s, 'user-1', now));
  const invite = (url = 'https://pay/1'): ClientBillingSignal => ({ type: 'invited', priceCents: 9900, setupFeeCents: 0, stripePriceId: 'price_1', checkoutUrl: url });
  const notices = () => dbs.owner.select().from(billingNotice);
  const rowOf = async (id: string) => (await dbs.owner.select().from(clientBilling).where(eq(clientBilling.clientId, id)))[0]!;

  it('creates the row for a client without one, invites, and queues one client-audience payment-link notice', async () => {
    expect(await apply(IDS.clientA2, invite())).toEqual({ changed: true, state: 'invited' });
    expect(await rowOf(IDS.clientA2)).toMatchObject({ agencyId: IDS.agencyA, enabled: true, state: 'invited', priceCents: 9900, stripePriceId: 'price_1' });
    const n = await notices();
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ agencyId: IDS.agencyA, clientId: IDS.clientA2, audience: 'client', kind: 'client-payment-link', sentAt: null });
    expect(n[0]!.params).toMatchObject({ checkoutUrl: 'https://pay/1' });
  });

  it('a resent link replaces the earlier unsent notice but keeps a sent one', async () => {
    await apply(IDS.clientA2, invite('https://pay/1'));
    await dbs.owner.update(billingNotice).set({ sentAt: new Date() });
    await apply(IDS.clientA2, invite('https://pay/2'));
    await apply(IDS.clientA2, invite('https://pay/3'));
    const urls = (await notices()).map((n) => (n.params as { checkoutUrl: string }).checkoutUrl).sort();
    expect(urls).toEqual(['https://pay/1', 'https://pay/3']);
  });

  it('does nothing (no write, no notice) for a signal that does not apply, and for an unknown client', async () => {
    expect(await apply(IDS.clientA1, invite())).toEqual({ changed: false, state: 'active' });
    expect(await apply('00000000-0000-4000-8000-0000000000ff', invite())).toEqual({ changed: false, state: null });
    expect(await notices()).toHaveLength(0);
  });

  it('active -> payment_failed -> payment_succeeded round trip stamps and clears payment_failed_since', async () => {
    const t = new Date('2026-10-15T12:00:00Z');
    await apply(IDS.clientA1, { type: 'payment_failed' }, t);
    expect(await rowOf(IDS.clientA1)).toMatchObject({ state: 'payment_needed', paymentFailedSince: t });
    expect((await notices()).map((n) => n.kind)).toEqual(['client-payment-failed']);
    await apply(IDS.clientA1, { type: 'payment_succeeded' }, t);
    expect(await rowOf(IDS.clientA1)).toMatchObject({ state: 'active', paymentFailedSince: null });
  });

  it('disable drops the pending link notice and moves an invited client to off', async () => {
    await apply(IDS.clientA2, invite());
    await apply(IDS.clientA2, { type: 'disabled' });
    expect(await rowOf(IDS.clientA2)).toMatchObject({ state: 'off', enabled: false });
    expect(await notices()).toHaveLength(0);
  });

  it('records the Stripe event time and ignores an older event afterwards', async () => {
    await apply(IDS.clientA1, { type: 'payment_succeeded', eventAt: new Date('2026-10-15T12:00:00Z') });
    expect(await apply(IDS.clientA1, { type: 'payment_failed', eventAt: new Date('2026-10-15T11:00:00Z') })).toMatchObject({ changed: false });
    expect((await rowOf(IDS.clientA1)).lastStripeEventAt).toEqual(new Date('2026-10-15T12:00:00Z'));
  });
});
