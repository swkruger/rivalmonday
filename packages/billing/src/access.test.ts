import { ToolError } from '@cs/core';
import { agencyBilling, agencyOnboarding, client } from '@cs/db';
import { IDS, openTestDbs } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { assertCanActivateClient, billingAccess } from './access';
import { AGENCY, addClients, resetBilling, setBilling } from './test-util';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

let planId: string;
beforeEach(async () => {
  planId = await resetBilling(dbs.owner); // agency A: 2 active clients, included seats 3
});

const attempt = (id = AGENCY) => dbs.service.transaction((tx) => assertCanActivateClient(tx, id));
const refusal = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(ToolError);
  expect((e as ToolError).code).toBe('billing_seat_limit');
  return (e as ToolError).message;
};

describe('billingAccess', () => {
  it('treats a missing row as a non-exempt pilot using the current standard plan', async () => {
    expect(await billingAccess(dbs.service, AGENCY)).toEqual({
      state: 'pilot', canAddActiveClient: true, readOnly: false, suspended: false, activeClients: 2, includedSeats: 3, seatCapExempt: false,
      reducedTrial: false, maxActiveClients: 3,
    });
    await addClients(dbs.owner, 1);
    expect((await billingAccess(dbs.service, AGENCY)).canAddActiveClient).toBe(false);
  });

  it('flags read_only and suspended', async () => {
    await setBilling(dbs.owner, planId, { state: 'read_only' });
    expect(await billingAccess(dbs.service, AGENCY)).toMatchObject({ readOnly: true, suspended: false, canAddActiveClient: false });
    await dbs.owner.execute(sql`update agency_billing set state = 'suspended'`);
    expect(await billingAccess(dbs.service, AGENCY)).toMatchObject({ readOnly: false, suspended: true, canAddActiveClient: false });
  });

  it('cancelled behaves like active until cancel_at, then refuses', async () => {
    const now = new Date('2026-10-14T00:00:00Z');
    await addClients(dbs.owner, 2);
    await setBilling(dbs.owner, planId, { state: 'cancelled', cancelAt: new Date('2026-11-01T00:00:00Z') });
    expect((await billingAccess(dbs.service, AGENCY, now)).canAddActiveClient).toBe(true);
    expect((await billingAccess(dbs.service, AGENCY, new Date('2026-11-02T00:00:00Z'))).canAddActiveClient).toBe(false);
  });

  it('reports seatCapExempt', async () => {
    await setBilling(dbs.owner, planId, { state: 'pilot', seatCapExempt: true });
    expect((await billingAccess(dbs.service, AGENCY)).seatCapExempt).toBe(true);
  });
});

describe('assertCanActivateClient', () => {
  it('allows below the cap and refuses at the cap when trialing, with the plan seat number', async () => {
    await setBilling(dbs.owner, planId, { state: 'trialing' });
    await attempt(); // 2 of 3
    await addClients(dbs.owner, 1);
    expect(await refusal(attempt())).toBe("You've used your 3 included clients. Upgrade to add more.");
  });

  it('works with no billing row (pilot) and locks the agency row instead', async () => {
    await attempt();
    await addClients(dbs.owner, 1);
    await refusal(attempt());
  });

  it('exempt pilot is allowed at 4; non-exempt pilot is blocked', async () => {
    await addClients(dbs.owner, 2); // 4 active
    await setBilling(dbs.owner, planId, { state: 'pilot', seatCapExempt: true });
    await attempt();
    await dbs.owner.execute(sql`update agency_billing set seat_cap_exempt = false`);
    await refusal(attempt());
  });

  it('active always allows', async () => {
    await addClients(dbs.owner, 5);
    await setBilling(dbs.owner, planId, { state: 'active' });
    await attempt();
  });

  it('past_due, read_only, suspended and expired-cancelled are refused with the payment message', async () => {
    await setBilling(dbs.owner, planId, { state: 'past_due' });
    for (const s of ['past_due', 'read_only', 'suspended']) {
      await dbs.owner.execute(sql.raw(`update agency_billing set state = '${s}'`));
      expect(await refusal(attempt())).toBe('Payment needed — update your payment method to add clients.');
    }
    await dbs.owner.execute(sql`update agency_billing set state = 'cancelled', cancel_at = now() - interval '1 day'`);
    await refusal(attempt());
  });

  it('refused-state copy is role-aware (R28): account managers get neutral copy; the cap message is the same for all', async () => {
    const asRole = (role: string) => dbs.service.transaction((tx) => assertCanActivateClient(tx, AGENCY, { role }));
    await setBilling(dbs.owner, planId, { state: 'past_due' });
    expect(await refusal(asRole('agency_admin'))).toBe('Payment needed — update your payment method to add clients.');
    expect(await refusal(asRole('account_manager'))).toBe("Your agency's account needs attention.");
    await dbs.owner.execute(sql`update agency_billing set state = 'trialing'`);
    await addClients(dbs.owner, 1);
    expect(await refusal(asRole('account_manager'))).toBe("You've used your 3 included clients. Upgrade to add more.");
  });

  it('serialises two concurrent activations at seat 3: exactly one succeeds', async () => {
    await setBilling(dbs.owner, planId, { state: 'trialing' });
    const [p1, p2] = await addClients(dbs.owner, 2, 'prospect');
    const activate = (id: string) =>
      dbs.service.transaction(async (tx) => {
        await assertCanActivateClient(tx, AGENCY);
        await new Promise((r) => setTimeout(r, 300)); // hold the lock so the other tx is genuinely concurrent
        await tx.update(client).set({ status: 'active' }).where(eq(client.id, id));
      });
    const results = await Promise.allSettled([activate(p1!), activate(p2!)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(ToolError);
    const active = await dbs.owner.select().from(client).where(eq(client.agencyId, IDS.agencyA));
    expect(active.filter((c) => c.status === 'active')).toHaveLength(3);
  });
});

describe('seat counts and paused clients (9b)', () => {
  it('billingAccess.activeClients excludes a paused client, which frees a seat for the cap', async () => {
    await addClients(dbs.owner, 1); // 3 active = cap
    expect((await billingAccess(dbs.service, AGENCY)).canAddActiveClient).toBe(false);
    const [c] = await dbs.owner.select({ id: client.id }).from(client).where(eq(client.agencyId, AGENCY)).limit(1);
    await dbs.owner.update(client).set({ pausedAt: new Date(), pausedBy: 'auto' }).where(eq(client.id, c!.id));
    expect(await billingAccess(dbs.service, AGENCY)).toMatchObject({ activeClients: 2, canAddActiveClient: true });
  });
});

describe('reduced trial allowance (phase 10 f12)', () => {
  const REDUCED = 'Your trial includes 1 active client. Add a payment method to monitor up to 3.';
  const source = (s: 'open' | 'invite' | 'legacy') => dbs.owner.insert(agencyOnboarding).values({ agencyId: AGENCY, source: s });
  const toOneActive = async () => {
    // agency A starts with 2 active clients; keep one so the cap decision is about the second.
    const [c] = await dbs.owner.select({ id: client.id }).from(client).where(eq(client.agencyId, AGENCY)).limit(1);
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, c!.id));
  };

  it.each([
    ['open', 'pilot', false, 3],
    ['open', 'trialing', true, 1],
    ['open', 'active', false, 3],
    ['invite', 'pilot', false, 3],
    ['invite', 'trialing', false, 3],
    ['invite', 'active', false, 3],
    ['legacy', 'pilot', false, 3],
    ['legacy', 'trialing', false, 3],
    ['legacy', 'active', false, 3],
  ] as const)('source %s, state %s -> reducedTrial=%s, maxActiveClients=%i', async (src, state, reduced, max) => {
    await source(src);
    await setBilling(dbs.owner, planId, { state });
    expect(await billingAccess(dbs.service, AGENCY)).toMatchObject({ reducedTrial: reduced, maxActiveClients: max });
  });

  it('a missing onboarding row is never reduced; a seat-cap-exempt trial is not reduced', async () => {
    await setBilling(dbs.owner, planId, { state: 'trialing' });
    expect(await billingAccess(dbs.service, AGENCY)).toMatchObject({ reducedTrial: false, maxActiveClients: 3 });
    await source('open');
    await dbs.owner.update(agencyBilling).set({ seatCapExempt: true });
    expect(await billingAccess(dbs.service, AGENCY)).toMatchObject({ reducedTrial: false, maxActiveClients: 3 });
  });

  it('open trial: the first active client is allowed, the second is refused with the trial copy (user-facing)', async () => {
    await source('open');
    await setBilling(dbs.owner, planId, { state: 'trialing' });
    await toOneActive();
    await toOneActive(); // 0 active
    await attempt();
    expect(await billingAccess(dbs.service, AGENCY)).toMatchObject({ activeClients: 0, canAddActiveClient: true });
    await addClients(dbs.owner, 1);
    expect((await billingAccess(dbs.service, AGENCY)).canAddActiveClient).toBe(false);
    const e = await attempt().then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(ToolError);
    expect((e as ToolError).code).toBe('billing_seat_limit');
    expect((e as ToolError).message).toBe(REDUCED);
    expect((e as ToolError).userFacing).toBe(true);
  });

  it('Checkout lifts it: once the state is active the second client is allowed', async () => {
    await source('open');
    await setBilling(dbs.owner, planId, { state: 'trialing' });
    await toOneActive(); // 1 active
    expect(await refusal(attempt())).toBe(REDUCED);
    await dbs.owner.update(agencyBilling).set({ state: 'active' });
    await attempt();
    expect(await billingAccess(dbs.service, AGENCY)).toMatchObject({ reducedTrial: false, canAddActiveClient: true });
  });

  it('invite-link trial keeps the 3-seat cap and its copy', async () => {
    await source('invite');
    await setBilling(dbs.owner, planId, { state: 'trialing' });
    await attempt(); // 2 of 3
    await addClients(dbs.owner, 1);
    expect(await refusal(attempt())).toBe("You've used your 3 included clients. Upgrade to add more.");
  });
});
