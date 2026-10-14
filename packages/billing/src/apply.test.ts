import { agencyBilling, agencyBillingEvent, billingNotice } from '@cs/db';
import { openTestDbs } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { applyBillingSignal } from './apply';
import { REASONS } from './state';
import { AGENCY, resetBilling, setBilling } from './test-util';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

let planId: string;
beforeEach(async () => {
  planId = await resetBilling(dbs.owner);
});

const apply = (signal: Parameters<typeof applyBillingSignal>[2], eventId?: string) =>
  dbs.service.transaction((tx) => applyBillingSignal(tx, AGENCY, signal, 'test', eventId));
const events = () => dbs.owner.select().from(agencyBillingEvent);
const notices = () => dbs.owner.select().from(billingNotice);
const row = async () => (await dbs.owner.select().from(agencyBilling).where(eq(agencyBilling.agencyId, AGENCY)))[0]!;

describe('applyBillingSignal', () => {
  it('writes the row, exactly one event and one notice on a state change', async () => {
    await setBilling(dbs.owner, planId, { state: 'active' });
    const now = new Date('2026-10-14T12:00:00Z');
    expect(await apply({ kind: 'payment_failed', now }, 'evt_1')).toEqual({ changed: true, state: 'past_due' });

    const r = await row();
    expect(r).toMatchObject({ state: 'past_due', pastDueSince: now, stateChangedAt: now });
    const evs = await events();
    expect(evs).toHaveLength(1);
    const ev = evs[0]!;
    expect(ev).toMatchObject({ agencyId: AGENCY, fromState: 'active', toState: 'past_due', reason: REASONS.paymentFailed, actor: 'test', stripeEventId: 'evt_1' });
    const ns = await notices();
    expect(ns).toHaveLength(1);
    expect(ns[0]).toMatchObject({
      agencyId: AGENCY,
      kind: 'billing_past_due',
      dedupeKey: `transition:${ev.id}`,
      sentAt: null,
      params: { fromState: 'active', toState: 'past_due', reason: REASONS.paymentFailed, pastDueSince: now.toISOString() },
    });
  });

  it('writes nothing on a null transition', async () => {
    await setBilling(dbs.owner, planId, { state: 'active' });
    const before = await row();
    expect(await apply({ kind: 'subscription_active' })).toEqual({ changed: false, state: 'active' });
    expect(await events()).toHaveLength(0);
    expect(await notices()).toHaveLength(0);
    expect(await row()).toEqual(before);
  });

  it('always sets stateChangedAt on a state change, even for subscription_active without a clock', async () => {
    const old = new Date('2026-01-01T00:00:00Z');
    await setBilling(dbs.owner, planId, { state: 'past_due', pastDueSince: old, stateChangedAt: old });
    await apply({ kind: 'subscription_active' });
    const r = await row();
    expect(r.state).toBe('active');
    expect(r.pastDueSince).toBeNull();
    expect(Date.now() - r.stateChangedAt.getTime()).toBeLessThan(60_000);
  });

  it('logs an event but no notice when the visible state does not change (127-day review flag)', async () => {
    const since = new Date('2026-01-01T00:00:00Z');
    await setBilling(dbs.owner, planId, { state: 'suspended', pastDueSince: since });
    const now = new Date(since.getTime() + 130 * 86_400_000);
    expect(await apply({ kind: 'timer', now, trialDays: 30 })).toEqual({ changed: true, state: 'suspended' });
    expect(await events()).toHaveLength(1);
    expect(await notices()).toHaveLength(0);
    expect((await row()).reviewFlaggedAt).toEqual(now);
  });

  it('creates a default pilot row (current standard plan) for an agency with none', async () => {
    const r = await apply({ kind: 'admin_end_pilot', now: new Date('2026-10-14T00:00:00Z'), trialDays: 30 });
    expect(r).toEqual({ changed: true, state: 'trialing' });
    expect(await row()).toMatchObject({ state: 'trialing', planId });
    const [n] = await notices();
    expect(n!.params).toMatchObject({ fromState: 'pilot', toState: 'trialing', trialEndsAt: '2026-11-13T00:00:00.000Z' });
  });

  it('includes pilotEndsAt in the params for a granted pilot', async () => {
    await setBilling(dbs.owner, planId, { state: 'trialing' });
    const endsAt = new Date('2026-12-01T00:00:00Z');
    await apply({ kind: 'admin_grant_pilot', endsAt, now: new Date('2026-10-14T00:00:00Z') });
    const [n] = await notices();
    expect(n).toMatchObject({ kind: 'billing_pilot' });
    expect(n!.params).toMatchObject({ pilotEndsAt: endsAt.toISOString() });
  });
});
