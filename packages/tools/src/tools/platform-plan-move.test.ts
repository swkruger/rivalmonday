import { fakeGateway, type FakeGateway } from '@cs/billing';
import { type AccessContext, createAccessContext } from '@cs/core';
import { agency, agencyBilling, agencyBillingEvent, agencyOnboarding, auditLog, client, membership, plan, platformAdmin, platformAuditLog } from '@cs/db';
import { IDS, openTestDbs, truncateAll } from '@cs/db/test-helpers';
import { createMemoryTransport } from '@cs/email';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { planFeaturesFor } from '../access/plan-features';
import { createToolRegistry } from '../registry';
import { monthlyCents, seatWarningFor } from './platform-plan-move';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const V1 = { code: 'standard', version: 1, name: 'Standard', basePriceCents: 22900, includedSeats: 3, seatPriceCents: 9900, trialDays: 30, isCurrent: false, createdBy: 'test', features: ['ask', 'mcp'] as ('ask' | 'mcp')[], stripeProductId: 'prod_b', stripeSeatProductId: 'prod_s', stripeBasePriceId: 'price_b1', stripeSeatPriceId: 'price_s1' };
const V2 = { ...V1, version: 2, name: 'Standard v2', basePriceCents: 19900, seatPriceCents: 7900, isCurrent: true, features: ['ask'] as ('ask' | 'mcp')[], stripeBasePriceId: 'price_b2', stripeSeatPriceId: 'price_s2' };
const PERIOD_END = new Date('2026-11-03T12:00:00Z');

const ctxOf = (userId: string) => createAccessContext({ agencyId: IDS.agencyA, userId, role: 'agency_admin', clientScope: 'all', features: [] });
const owner = ctxOf('op');
const staff = ctxOf('staff');
const viewer = ctxOf('viewer');

let gw: FakeGateway;
let transport: ReturnType<typeof createMemoryTransport>;
let registry: ReturnType<typeof createToolRegistry>;
let v1: string;
let v2: string;
let n = 0;

type Move = { targetPlanId: string; targetVersion: number; results: Array<{ agencyId: string; outcome: string; reason?: string; emailed: boolean }> };
type ListOut = { currentPlanId: string; currentVersion: number; agencies: Array<Record<string, unknown> & { agencyId: string }> };
const move = (ids: string[], ctx: AccessContext = owner) => registry.invoke(ctx, 'move_agencies_to_current_plan', { agencyIds: ids }) as Promise<Move>;
const list = (ctx: AccessContext = viewer) => registry.invoke(ctx, 'list_plan_agencies', {}) as Promise<ListOut>;
const fails = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as { code?: string }; }
  throw new Error('expected a failure');
};
const row = async (id: string) => (await dbs.owner.select().from(agencyBilling).where(eq(agencyBilling.agencyId, id)))[0]!;
const reasons = async (id: string) => (await dbs.owner.select().from(agencyBillingEvent).where(eq(agencyBillingEvent.agencyId, id))).map((e) => e.reason).sort();

interface Mk {
  billing?: Partial<typeof agencyBilling.$inferInsert> | null;
  clients?: number;
  held?: boolean;
  archived?: boolean;
  /** Seed a live fake subscription with base + seat lines under this id. */
  sub?: string;
  /** Store this subscription id without seeding it in the fake (the swap then fails like Stripe's resource_missing). */
  ghostSub?: string;
  open?: boolean;
}

/** One agency with an admin (for the email), `clients` active clients and an optional billing row on v1. */
async function mk(name: string, o: Mk = {}): Promise<string> {
  n++;
  const [a] = await dbs.owner.insert(agency).values({
    name,
    ...(o.archived ? { archivedAt: new Date() } : {}),
    ...(o.held ? { suspendedAt: new Date(), suspendedReason: 'Held for test', suspendedBy: 'op' } : {}),
  }).returning({ id: agency.id });
  const id = a!.id;
  await seedUser(dbs.owner, `adm${n}`, `adm${n}@example.com`);
  await dbs.owner.insert(membership).values({ userId: `adm${n}`, agencyId: id, role: 'agency_admin', createdBy: 'seed' });
  for (let i = 0; i < (o.clients ?? 0); i++) await dbs.owner.insert(client).values({ agencyId: id, name: `${name} client ${i}`, verticalId: 'hvac_plumbing' });
  if (o.open) await dbs.owner.insert(agencyOnboarding).values({ agencyId: id, source: 'open' });
  if (o.sub) {
    gw.seedSubscription({
      id: o.sub, customerId: `cus_${n}`, currentPeriodEnd: PERIOD_END, seatQuantity: 1,
      items: [{ id: `si_base_${n}`, priceId: 'price_b1', quantity: 1 }, { id: `si_seat_${n}`, priceId: 'price_s1', quantity: 1 }],
    });
  }
  if (o.billing !== null) {
    const sub = o.sub ?? o.ghostSub;
    await dbs.owner.insert(agencyBilling).values({
      agencyId: id, state: 'pilot', planId: v1, ...(sub ? { stripeSubscriptionId: sub, stripeCustomerId: `cus_${n}`, billableSeatsSynced: 1 } : {}), ...o.billing,
    });
  }
  return id;
}

beforeEach(async () => {
  vi.restoreAllMocks();
  n = 0;
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  for (const u of ['op', 'staff', 'viewer']) await seedUser(dbs.owner, u, `${u}@example.com`);
  await dbs.owner.insert(platformAdmin).values([{ userId: 'staff', role: 'staff', createdBy: 'test' }, { userId: 'viewer', role: 'viewer', createdBy: 'test' }]);
  v1 = (await dbs.owner.insert(plan).values(V1).returning({ id: plan.id }))[0]!.id;
  v2 = (await dbs.owner.insert(plan).values(V2).returning({ id: plan.id }))[0]!.id;
  gw = fakeGateway();
  transport = createMemoryTransport();
  registry = createToolRegistry(
    { app: dbs.app, service: dbs.service, billing: gw, platformAdmins: ['op@example.com'], leadEmail: { transport, appUrl: 'https://app.test/', fromAddress: 'team@app.test', platformAdmins: [] } },
    { audit: { record: async () => {} } },
  );
});

describe('helpers', () => {
  const t = { basePriceCents: 19900, includedSeats: 3, seatPriceCents: 7900 };
  it('monthlyCents', () => {
    expect(monthlyCents(t, 0)).toBe(19900);
    expect(monthlyCents(t, 3)).toBe(19900);
    expect(monthlyCents(t, 5)).toBe(19900 + 2 * 7900);
  });
  it('seatWarningFor per state', () => {
    const w = (state: 'pilot' | 'trialing' | 'active' | 'past_due' | 'read_only', active: number, x: { seatCapExempt?: boolean; reducedTrial?: boolean } = {}) =>
      seatWarningFor({ state, seatCapExempt: x.seatCapExempt ?? false, reducedTrial: x.reducedTrial ?? false }, active, t);
    expect(w('active', 3)).toBeNull();
    expect(w('active', 4)).toBe('extra_seats');
    expect(w('past_due', 4)).toBe('extra_seats');
    expect(w('pilot', 4)).toBe('over_cap');
    expect(w('pilot', 4, { seatCapExempt: true })).toBeNull();
    expect(w('trialing', 4)).toBe('over_cap');
    expect(w('trialing', 4, { reducedTrial: true })).toBeNull();
    expect(w('read_only', 4)).toBeNull();
  });
});

describe('move_agencies_to_current_plan', () => {
  it('viewer and staff refused for move; viewer can list', async () => {
    const a = await mk('Alpha', { billing: { state: 'pilot' } });
    expect((await fails(move([a], viewer))).code).toBe('permission_denied');
    expect((await fails(move([a], staff))).code).toBe('permission_denied');
    expect((await row(a)).planId).toBe(v1);
    expect(await dbs.owner.select().from(auditLog).where(eq(auditLog.tool, 'move_agencies_to_current_plan'))).toEqual([]);
    expect((await list(viewer)).agencies.map((x) => x.agencyId)).toEqual([a]);
  });

  it('mixed batch', async () => {
    const held = await mk('Held', { billing: { state: 'active' }, held: true });
    const cancelled = await mk('Cancelled', { billing: { state: 'cancelled' } });
    const archived = await mk('Archived', { billing: { state: 'active' }, archived: true });
    const current = await mk('Current', { billing: { state: 'active', planId: v2 } });
    const nullPlan = await mk('Null plan', { billing: { state: 'trialing', planId: null } });
    const live = await mk('Live', { billing: { state: 'active' }, sub: 'sub_live', clients: 1 });
    const pilot = await mk('Pilot', { billing: { state: 'pilot' } });
    const unknown = '00000000-0000-4000-8000-0000000000ff';
    const out = await move([held, cancelled, archived, current, nullPlan, live, pilot, unknown, live]);
    expect(out).toMatchObject({ targetPlanId: v2, targetVersion: 2 });
    expect(out.results.map((r) => [r.agencyId, r.outcome, r.reason])).toEqual([
      [held, 'refused', 'on_hold'], [cancelled, 'refused', 'cancelled'], [archived, 'refused', 'not_found'], [current, 'already_current', undefined],
      [nullPlan, 'moved', undefined], [live, 'moved', undefined], [pilot, 'moved', undefined], [unknown, 'refused', 'not_found'],
    ]);
    for (const id of [held, cancelled, archived]) expect((await row(id)).planId).toBe(v1);
    for (const id of [nullPlan, live, pilot]) expect((await row(id)).planId).toBe(v2);
    expect(await reasons(held)).toEqual([]);
  });

  it('active with sub swaps prices with seat qty rule', async () => {
    const a = await mk('Five', { billing: { state: 'active', seatSyncPending: true }, sub: 'sub_five', clients: 5 });
    const out = await move([a]);
    expect(out.results[0]).toMatchObject({ outcome: 'moved' });
    expect(gw.swaps).toEqual([{ subscriptionId: 'sub_five', basePriceId: 'price_b2', seatPriceId: 'price_s2', seatQuantity: 2 }]);
    expect(await row(a)).toMatchObject({ planId: v2, billableSeatsSynced: 2, seatSyncPending: false, state: 'active' });
    const [ev] = await dbs.owner.select().from(agencyBillingEvent).where(eq(agencyBillingEvent.agencyId, a));
    expect(ev).toMatchObject({ fromState: 'active', toState: 'active', reason: 'admin_plan_version_move', actor: 'op' });
  });

  it('read_only and suspended with a live sub swap prices and get the next-billing email (P12)', async () => {
    const ro = await mk('Read only', { billing: { state: 'read_only' }, sub: 'sub_ro', clients: 4 }); // adm1
    const su = await mk('Suspended', { billing: { state: 'suspended' }, sub: 'sub_su', clients: 5 }); // adm2
    const out = await move([ro, su]);
    expect(out.results).toEqual([
      { agencyId: ro, outcome: 'moved', emailed: true },
      { agencyId: su, outcome: 'moved', emailed: true },
    ]);
    expect(gw.swaps).toEqual([
      { subscriptionId: 'sub_ro', basePriceId: 'price_b2', seatPriceId: 'price_s2', seatQuantity: 1 },
      { subscriptionId: 'sub_su', basePriceId: 'price_b2', seatPriceId: 'price_s2', seatQuantity: 2 },
    ]);
    expect(await row(ro)).toMatchObject({ planId: v2, billableSeatsSynced: 1, seatSyncPending: false, state: 'read_only' });
    expect(await row(su)).toMatchObject({ planId: v2, billableSeatsSynced: 2, seatSyncPending: false, state: 'suspended' });
    for (const to of ['adm1@example.com', 'adm2@example.com']) {
      const mail = transport.sent.find((m) => m.to === to)!;
      expect(mail.text).toContain('From November 3, 2026, your plan is $199/month');
      expect(mail.text).not.toContain('These prices apply when you subscribe.');
    }
    const listed = Object.fromEntries((await list()).agencies.map((a) => [a.agencyId, a.swapsStripe]));
    expect(listed).toEqual({}); // both moved off the list
  });

  it('pilot and no-card trial: no gateway call, plan_id set', async () => {
    const p = await mk('Pilot', { billing: { state: 'pilot', billableSeatsSynced: 4, seatSyncPending: true }, clients: 5 });
    const t = await mk('Trial', { billing: { state: 'trialing' }, clients: 1 });
    const out = await move([p, t]);
    expect(out.results.map((r) => r.outcome)).toEqual(['moved', 'moved']);
    expect(gw.callsTo('swapSubscriptionPlan')).toEqual([]);
    expect(await row(p)).toMatchObject({ planId: v2, billableSeatsSynced: 4, seatSyncPending: true });
    expect((await row(t)).planId).toBe(v2);
  });

  it('stripe failure reverts plan_id and seats', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const a = await mk('One', { billing: { state: 'active' }, sub: 'sub_one', clients: 4 });
    const b = await mk('Two', { billing: { state: 'past_due', seatSyncPending: true }, ghostSub: 'sub_ghost', clients: 5 });
    const c = await mk('Three', { billing: { state: 'trialing' }, sub: 'sub_three' });
    const out = await move([a, b, c]);
    expect(out.results.map((r) => [r.outcome, r.reason])).toEqual([['moved', undefined], ['failed', 'stripe_error'], ['moved', undefined]]);
    expect(await row(b)).toMatchObject({ planId: v1, billableSeatsSynced: 1, seatSyncPending: true });
    expect(await reasons(b)).toEqual(['admin_plan_version_move', 'admin_plan_version_move_reverted']);
    expect((await row(a)).planId).toBe(v2);
    expect((await row(c)).planId).toBe(v2);
    expect(gw.swaps.map((s) => s.subscriptionId)).toEqual(['sub_one', 'sub_three']);
    expect(JSON.stringify(err.mock.calls)).not.toMatch(/sub_ghost/);
  });

  it('one platform audit row per agency', async () => {
    const ids = [await mk('A1', { billing: { state: 'pilot' } }), await mk('A2', { billing: { state: 'trialing' } }), await mk('A3', { billing: { state: 'active', planId: v2 } })];
    await move(ids);
    const rows = await dbs.owner.select().from(auditLog).where(eq(auditLog.tool, 'move_agencies_to_current_plan'));
    expect(rows.map((r) => r.agencyId).sort()).toEqual([...ids].sort());
    for (const r of rows) expect(r).toMatchObject({ role: 'platform_owner', outcome: 'ok', userId: 'op' });
    expect(await dbs.owner.select().from(platformAuditLog).where(eq(platformAuditLog.tool, 'move_agencies_to_current_plan'))).toEqual([]);
  });

  it('email: sent when terms change, not for pilot, not when nothing changes, on_subscribe without sub', async () => {
    const live = await mk('Live', { billing: { state: 'active' }, sub: 'sub_live' }); // adm1
    const pilot = await mk('Pilot', { billing: { state: 'pilot' } }); // adm2
    const trial = await mk('Trial', { billing: { state: 'trialing' } }); // adm3
    const out = await move([live, pilot, trial]);
    expect(out.results.map((r) => r.emailed)).toEqual([true, false, true]);
    expect(transport.sent.map((m) => m.to).sort()).toEqual(['adm1@example.com', 'adm3@example.com']);
    const liveMail = transport.sent.find((m) => m.to === 'adm1@example.com')!;
    expect(liveMail.text).toContain('From November 3, 2026, your plan is $199/month including 3 client seats, then $79 per extra seat (was $229 with 3 seats, $99 each).');
    expect(liveMail.text).toContain('No longer included: MCP access.');
    expect(transport.sent.find((m) => m.to === 'adm3@example.com')!.text).toContain('These prices apply when you subscribe.');

    // Nothing changes: the agency's version has the target's terms and features.
    await dbs.owner.update(plan).set({ basePriceCents: V2.basePriceCents, seatPriceCents: V2.seatPriceCents, features: ['ask'] }).where(eq(plan.id, v1));
    const same = await mk('Same', { billing: { state: 'active' }, sub: 'sub_same' });
    const again = await move([same]);
    expect(again.results[0]).toMatchObject({ outcome: 'moved', emailed: false });
    expect(transport.sent).toHaveLength(2);
  });

  it('idempotent rerun', async () => {
    const ids = [await mk('Live', { billing: { state: 'active' }, sub: 'sub_live' }), await mk('Trial', { billing: { state: 'trialing' } })];
    await move(ids);
    const swaps = gw.swaps.length;
    const sent = transport.sent.length;
    const again = await move(ids);
    expect(again.results.map((r) => r.outcome)).toEqual(['already_current', 'already_current']);
    expect(again.results.every((r) => !r.emailed)).toBe(true);
    expect(gw.swaps.length).toBe(swaps);
    expect(transport.sent.length).toBe(sent);
  });

  it('planFeaturesFor after move to version without mcp', async () => {
    const live = await mk('Live', { billing: { state: 'active' }, sub: 'sub_live' });
    const trial = await mk('Trial', { billing: { state: 'trialing' } });
    const pilot = await mk('Pilot', { billing: { state: 'pilot' } });
    expect(await planFeaturesFor(dbs.service, live)).toEqual(['ask', 'mcp']);
    await move([live, trial, pilot]);
    expect(await planFeaturesFor(dbs.service, live)).toEqual(['ask']);
    expect(await planFeaturesFor(dbs.service, trial)).toEqual(['ask']);
    expect(await planFeaturesFor(dbs.service, pilot)).toEqual(['ask', 'mcp']);
  });
});

describe('list_plan_agencies', () => {
  it('excludes current and archived, includes null plan', async () => {
    const old = await mk('Bravo old', { billing: { state: 'active' }, sub: 'sub_old' });
    const nullPlan = await mk('Zulu null', { billing: { state: 'trialing', planId: null } });
    const held = await mk('Alpha held', { billing: { state: 'pilot' }, held: true });
    await mk('Current', { billing: { state: 'active', planId: v2 } });
    await mk('Archived', { billing: { state: 'active' }, archived: true });
    await mk('No row', { billing: null });
    const out = await list();
    expect(out).toMatchObject({ currentPlanId: v2, currentVersion: 2 });
    expect(out.agencies.map((a) => a.agencyId)).toEqual([nullPlan, held, old]); // version asc nulls first, then name
    const byId = Object.fromEntries(out.agencies.map((a) => [a.agencyId, a]));
    // P11: a null plan reports what planFor resolves (the current version's prices) and every feature.
    expect(byId[nullPlan]).toMatchObject({ planId: null, version: null, basePriceCents: 19900, includedSeats: 3, seatPriceCents: 7900, features: ['ask', 'mcp'], swapsStripe: false, onHold: false });
    expect(byId[held]).toMatchObject({ planId: v1, version: 1, onHold: true, swapsStripe: false, features: ['ask', 'mcp'] });
    expect(byId[old]).toMatchObject({ state: 'active', swapsStripe: true, onHold: false });
    expect(gw.calls).toEqual([]);
  });

  it('swapsStripe: any held subscription id unless cancelled', async () => {
    const ro = await mk('Read only', { billing: { state: 'read_only' }, sub: 'sub_ro' });
    const su = await mk('Suspended', { billing: { state: 'suspended' }, sub: 'sub_su' });
    const cancelled = await mk('Cancelled', { billing: { state: 'cancelled' }, sub: 'sub_c' });
    const noSub = await mk('Read only no sub', { billing: { state: 'read_only' } });
    const s = Object.fromEntries((await list()).agencies.map((a) => [a.agencyId, a.swapsStripe]));
    expect(s).toEqual({ [ro]: true, [su]: true, [cancelled]: false, [noSub]: false });
  });

  it('monthly math', async () => {
    const a = await mk('Five', { billing: { state: 'active' }, sub: 'sub_five', clients: 5 });
    const [r] = (await list()).agencies;
    expect(r).toMatchObject({ agencyId: a, activeClients: 5, extraSeatsAfter: 2, monthlyNowCents: 22900 + 2 * 9900, monthlyAfterCents: 19900 + 2 * 7900, seatWarning: 'extra_seats' });
  });

  it('seatWarning per state incl. reduced trial and exempt pilot', async () => {
    const pilot = await mk('Pilot', { billing: { state: 'pilot' }, clients: 4 });
    const exempt = await mk('Pilot exempt', { billing: { state: 'pilot', seatCapExempt: true }, clients: 4 });
    const trial = await mk('Trial full', { billing: { state: 'trialing' }, clients: 4 });
    const reduced = await mk('Trial reduced', { billing: { state: 'trialing' }, clients: 4, open: true });
    const pastDue = await mk('Past due', { billing: { state: 'past_due' }, clients: 4 });
    const under = await mk('Under', { billing: { state: 'active' }, clients: 3 });
    const w = Object.fromEntries((await list()).agencies.map((a) => [a.agencyId, a.seatWarning]));
    expect(w).toEqual({ [pilot]: 'over_cap', [exempt]: null, [trial]: 'over_cap', [reduced]: null, [pastDue]: 'extra_seats', [under]: null });
  });
});
