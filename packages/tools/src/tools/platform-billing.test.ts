import { fakeGateway, handleStripeEvent, hashInviteToken, runBillingDaily, type FakeGateway } from '@cs/billing';
import { type AccessContext, createAccessContext } from '@cs/core';
import { agency, agencyBilling, agencyBillingEvent, agencyDailyStat, agencyConnect, agencyInviteLink, auditLog, client, clientBilling, discountCode, plan, platformAdmin, platformAuditLog, platformSetting } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { createToolRegistry } from '../registry';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const APP = 'https://app.test';
const DAY = 86_400_000;
const STD = { code: 'standard', version: 1, name: 'Standard', basePriceCents: 22900, includedSeats: 3, seatPriceCents: 9900, trialDays: 30, isCurrent: true, createdBy: 'test' };
const ctxOf = (userId: string) => createAccessContext({ agencyId: IDS.agencyA, userId, role: 'agency_admin', clientScope: 'all', features: [] });
const owner = ctxOf('op'); // env-listed platform owner
const staff = ctxOf('staff');
const viewer = ctxOf('viewer');
const admin = ctxOf('admin');
const admin2 = (agencyId: string) => createAccessContext({ agencyId, userId: 'admin', role: 'agency_admin', clientScope: 'all', features: [] }); // plain agency admin, not an operator

let gw: FakeGateway;
let planId: string;
let registry: ReturnType<typeof createToolRegistry>;
const call = (ctx: AccessContext, name: string, input: unknown = {}) => registry.invoke(ctx, name, input);
const fails = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e as { code?: string; message: string }; }
  throw new Error('expected a failure');
};
const billingRow = async (id = IDS.agencyA) => (await dbs.owner.select().from(agencyBilling).where(eq(agencyBilling.agencyId, id)))[0];
const setBilling = (v: Partial<typeof agencyBilling.$inferInsert>) => dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'pilot', planId, ...v });
const events = () => dbs.owner.select().from(agencyBillingEvent).where(eq(agencyBillingEvent.agencyId, IDS.agencyA));
const audits = (tool: string) => dbs.owner.select().from(auditLog).where(eq(auditLog.tool, tool));

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  for (const u of ['op', 'staff', 'viewer', 'admin']) await seedUser(dbs.owner, u, `${u}@example.com`);
  await seedTenancy(dbs.owner);
  await dbs.owner.insert(platformAdmin).values([
    { userId: 'staff', role: 'staff', createdBy: 'test' },
    { userId: 'viewer', role: 'viewer', createdBy: 'test' },
  ]);
  planId = (await dbs.owner.insert(plan).values(STD).returning({ id: plan.id }))[0]!.id;
  gw = fakeGateway();
  registry = createToolRegistry({ app: dbs.app, service: dbs.service, billing: gw, appUrl: APP, platformAdmins: ['op@example.com'] }, { audit: { record: async () => {} } });
});

const A = IDS.agencyA;
const CODE = { code: 'WELCOME20', percentOff: 20, appliesTo: 'both', duration: 'once' };
const INVITE = { offer: 'trial' };
const PLAN_IN = { name: 'Standard v2', basePriceCents: 29900, includedSeats: 5, seatPriceCents: 7900, trialDays: 14 };

/** [tool, input, minimum role]. Write tools get a valid-enough input; refusal happens before any work. */
const MATRIX: [string, unknown, 'viewer' | 'staff' | 'owner'][] = [
  ['list_plans', {}, 'viewer'],
  ['list_discount_codes', {}, 'viewer'],
  ['get_agency_billing', { agencyId: A }, 'viewer'],
  ['get_billing_overview', {}, 'viewer'],
  ['list_invite_links', {}, 'staff'],
  ['create_invite_link', INVITE, 'staff'],
  ['revoke_invite_link', { id: IDS.agencyA }, 'staff'],
  ['grant_pilot', { agencyId: A }, 'staff'],
  ['end_pilot', { agencyId: A }, 'staff'],
  ['extend_trial', { agencyId: A, until: new Date(Date.now() + DAY).toISOString() }, 'staff'],
  ['attach_agency_discount', { agencyId: A, discountCodeId: IDS.agencyA }, 'staff'],
  ['create_plan_version', PLAN_IN, 'owner'],
  ['create_discount_code', CODE, 'owner'],
  ['revoke_discount_code', { id: IDS.agencyA }, 'owner'],
  ['set_seat_cap_exempt', { agencyId: A, exempt: true }, 'owner'],
  ['set_connect_fee_percent', { percent: 1 }, 'owner'],
  ['get_connect_overview', {}, 'viewer'],
];

describe('role minimums', () => {
  const RANK = { viewer: 1, staff: 2, owner: 3 } as const;
  const WHO = [['viewer', viewer], ['staff', staff], ['owner', owner]] as const;
  it.each(MATRIX)('%s', async (name, input, min) => {
    for (const [role, ctx] of WHO) {
      if (RANK[role] >= RANK[min]) continue;
      expect((await fails(call(ctx, name, input))).code, `${name} as ${role}`).toBe('permission_denied');
    }
    expect((await fails(call(admin, name, input))).code, `${name} as agency admin`).toBe('permission_denied');
    expect(gw.calls).toEqual([]);
    expect(await dbs.owner.select().from(agencyInviteLink)).toEqual([]);
  });

  it('every tool is allowed at its minimum role', async () => {
    const code = (await call(owner, 'create_discount_code', { ...CODE, code: 'XYZ1' })) as { id: string };
    for (const [name, input] of [['list_plans', {}], ['list_discount_codes', {}], ['get_billing_overview', {}], ['get_connect_overview', {}], ['get_agency_billing', { agencyId: A }]] as const) {
      await call(viewer, name, input);
    }
    await call(staff, 'list_invite_links', {});
    await call(staff, 'attach_agency_discount', { agencyId: A, discountCodeId: code.id });
  });
});

describe('create_discount_code', () => {
  it('maps appliesTo to product lists from the current plan, syncing the plan first', async () => {
    expect((await dbs.owner.select().from(plan))[0]!.stripeProductId).toBeNull();
    await call(owner, 'create_discount_code', { ...CODE, code: 'BOTH', appliesTo: 'both' });
    await call(owner, 'create_discount_code', { ...CODE, code: 'BASE', appliesTo: 'base' });
    await call(owner, 'create_discount_code', { ...CODE, code: 'SEATS', appliesTo: 'seats' });
    expect(gw.callsTo('createPrices')).toHaveLength(1);
    const p = (await dbs.owner.select().from(plan))[0]!;
    const lists = gw.callsTo('createCoupon').map((c) => (c.args[0] as { appliesToProductIds: string[] }).appliesToProductIds);
    expect(lists[0]).toEqual([p.stripeProductId, p.stripeSeatProductId]);
    expect(lists[1]).toEqual([p.stripeProductId]);
    expect(lists[2]).toEqual([p.stripeSeatProductId]);
    expect(p.stripeProductId).not.toBe(p.stripeSeatProductId);
  });

  it('stores the row, carries cap and expiry on coupon and promotion code', async () => {
    const exp = new Date(Date.now() + 5 * DAY);
    const r = (await call(owner, 'create_discount_code', { ...CODE, maxRedemptions: 3, expiresAt: exp.toISOString() })) as { id: string };
    const [row] = await dbs.owner.select().from(discountCode).where(eq(discountCode.id, r.id));
    expect(row).toMatchObject({ code: 'WELCOME20', appliesTo: 'both', duration: 'once', maxRedemptions: 3, createdBy: 'op', amountOffCents: null });
    expect(Number(row!.percentOff)).toBe(20);
    expect(row!.stripePromotionCodeId).toMatch(/^promo_/);
    expect(row!.expiresAt!.getTime()).toBe(exp.getTime());
    const coupon = gw.callsTo('createCoupon')[0]!.args[0] as { maxRedemptions: number; redeemBy: Date };
    expect(coupon.maxRedemptions).toBe(3);
    expect(coupon.redeemBy.getTime()).toBe(exp.getTime());
    expect(gw.callsTo('createPromotionCode')[0]!.args[0]).toMatchObject({ code: 'WELCOME20', maxRedemptions: 3 });
  });

  it('percentOff allows at most 2 decimals', async () => {
    expect((await fails(call(owner, 'create_discount_code', { ...CODE, percentOff: 12.345 }))).code).toBe('invalid_input');
    await call(owner, 'create_discount_code', { ...CODE, code: 'TWELVE', percentOff: 12.35 });
    expect((gw.callsTo('createCoupon')[0]!.args[0] as { percentOff: number }).percentOff).toBe(12.35);
  });

  it('percent XOR amount; durationMonths iff repeating', async () => {
    for (const bad of [
      { ...CODE, amountOffCents: 500 },
      { code: 'N', appliesTo: 'both', duration: 'once' },
      { ...CODE, duration: 'repeating' },
      { ...CODE, durationMonths: 3 },
    ]) expect((await fails(call(owner, 'create_discount_code', bad))).code).toBe('invalid_input');
    await call(owner, 'create_discount_code', { code: 'AMT', amountOffCents: 500, appliesTo: 'seats', duration: 'repeating', durationMonths: 3 });
    expect(gw.callsTo('createCoupon').at(-1)!.args[0]).toMatchObject({ amountOffCents: 500, duration: 'repeating', durationInMonths: 3 });
    expect(await dbs.owner.select().from(discountCode)).toHaveLength(1);
  });

  it('validates restrictedAgencyIds exist', async () => {
    const e = await fails(call(owner, 'create_discount_code', { ...CODE, restrictedAgencyIds: [A, '99999999-9999-4999-8999-999999999999'] }));
    expect(e.code).toBe('invalid_input');
    expect(gw.calls).toEqual([]);
    expect(await dbs.owner.select().from(discountCode)).toEqual([]);
  });

  it('restricted codes get a coupon only (no promotion code); unrestricted keep one', async () => {
    await setBilling({ stripeCustomerId: 'cus_a' });
    for (const [code, ids] of [['ONE', [A]], ['TWO', [A, IDS.agencyB]]] as const) {
      const r = (await call(owner, 'create_discount_code', { ...CODE, code, restrictedAgencyIds: ids })) as { id: string };
      const [row] = await dbs.owner.select().from(discountCode).where(eq(discountCode.id, r.id));
      expect(row!.stripePromotionCodeId).toBeNull();
      expect(row!.stripeCouponId).toBeTruthy();
    }
    expect(gw.callsTo('createPromotionCode')).toEqual([]);
    await call(owner, 'create_discount_code', { ...CODE, code: 'OPEN' });
    expect(gw.callsTo('createPromotionCode')).toHaveLength(1);
  });

  it('a restricted code is redeemable by its agency only', async () => {
    await call(owner, 'create_discount_code', { ...CODE, code: 'ONLYA', restrictedAgencyIds: [A] });
    await expect(call(admin2(IDS.agencyB), 'redeem_discount_code', { code: 'ONLYA' })).rejects.toMatchObject({ code: 'invalid_code' });
    expect(await call(admin2(A), 'redeem_discount_code', { code: 'ONLYA' })).toMatchObject({ applied: true });
    expect((await billingRow())!.attachedCouponId).toBeTruthy();
  });

  it('code uniqueness is case-insensitive', async () => {
    await call(owner, 'create_discount_code', CODE);
    expect((await fails(call(owner, 'create_discount_code', { ...CODE, code: 'welcome20' }))).code).toBe('conflict');
    expect(await dbs.owner.select().from(discountCode)).toHaveLength(1);
  });

  it('a gateway failure writes nothing', async () => {
    await call(owner, 'create_discount_code', { ...CODE, code: 'FIRST' }); // plan now synced
    gw.failNext();
    await fails(call(owner, 'create_discount_code', { ...CODE, code: 'SECOND' }));
    expect((await dbs.owner.select().from(discountCode)).map((d) => d.code)).toEqual(['FIRST']);
    // failure at the promotion-code step (after the coupon exists) also writes nothing
    const origPromo = gw.createPromotionCode;
    gw.createPromotionCode = async () => { throw new Error('boom'); };
    await fails(call(owner, 'create_discount_code', { ...CODE, code: 'THIRD' }));
    gw.createPromotionCode = origPromo;
    expect((await dbs.owner.select().from(discountCode)).map((d) => d.code)).toEqual(['FIRST']);
  });

  it('is audited to the platform log (no target agency)', async () => {
    await call(owner, 'create_discount_code', CODE);
    expect(await dbs.owner.select().from(platformAuditLog).where(eq(platformAuditLog.tool, 'create_discount_code'))).toHaveLength(1);
  });
});

describe('revoke_discount_code', () => {
  it('sets revoked_at and deactivates the promotion code', async () => {
    const r = (await call(owner, 'create_discount_code', CODE)) as { id: string };
    await call(owner, 'revoke_discount_code', { id: r.id });
    const [row] = await dbs.owner.select().from(discountCode).where(eq(discountCode.id, r.id));
    expect(row!.revokedAt).not.toBeNull();
    expect(gw.callsTo('deactivatePromotionCode')).toHaveLength(1);
    expect([...gw.promotionCodes.values()][0]!.active).toBe(false);
  });

  it('still revokes locally when the gateway fails', async () => {
    const r = (await call(owner, 'create_discount_code', CODE)) as { id: string };
    gw.failNext();
    await call(owner, 'revoke_discount_code', { id: r.id });
    const [row] = await dbs.owner.select().from(discountCode).where(eq(discountCode.id, r.id));
    expect(row!.revokedAt).not.toBeNull();
  });

  it('unknown id -> not_found', async () => {
    expect((await fails(call(owner, 'revoke_discount_code', { id: '99999999-9999-4999-8999-999999999999' }))).code).toBe('not_found');
  });
});

describe('invite links', () => {
  it('stores hash and prefix only; the token is returned once and never listed', async () => {
    const r = (await call(staff, 'create_invite_link', { offer: 'trial', note: 'for Acme', maxUses: 2 })) as { url: string; token: string };
    expect(r.url).toBe(`${APP}/join/${r.token}`);
    expect(r.token).toMatch(/^rm_inv_/);
    const [row] = await dbs.owner.select().from(agencyInviteLink);
    expect(row).toMatchObject({ tokenHash: hashInviteToken(r.token), tokenPrefix: r.token.slice(0, 12), offer: 'trial', maxUses: 2, uses: 0, note: 'for Acme', createdBy: 'staff' });
    expect(JSON.stringify(row)).not.toContain(r.token);
    const days = (row!.expiresAt.getTime() - Date.now()) / DAY;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
    const listed = JSON.stringify(await call(staff, 'list_invite_links', {}));
    expect(listed).not.toContain(r.token);
    expect(listed).not.toContain(row!.tokenHash);
    expect(listed).toContain(row!.tokenPrefix);
  });

  it('expiresInDays 1-90; pilot offer requires pilotEndsAt; trial refuses it', async () => {
    expect((await fails(call(staff, 'create_invite_link', { ...INVITE, expiresInDays: 0 }))).code).toBe('invalid_input');
    expect((await fails(call(staff, 'create_invite_link', { ...INVITE, expiresInDays: 91 }))).code).toBe('invalid_input');
    expect((await fails(call(staff, 'create_invite_link', { offer: 'pilot' }))).code).toBe('invalid_input');
    expect((await fails(call(staff, 'create_invite_link', { offer: 'trial', pilotEndsAt: new Date(Date.now() + DAY).toISOString() }))).code).toBe('invalid_input');
    await call(staff, 'create_invite_link', { offer: 'pilot', pilotEndsAt: new Date(Date.now() + 30 * DAY).toISOString(), expiresInDays: 90 });
    expect(await dbs.owner.select().from(agencyInviteLink)).toHaveLength(1);
  });

  it('discountCodeId must exist and not be revoked', async () => {
    expect((await fails(call(staff, 'create_invite_link', { ...INVITE, discountCodeId: '99999999-9999-4999-8999-999999999999' }))).code).toBe('invalid_input');
    const d = (await call(owner, 'create_discount_code', CODE)) as { id: string };
    await call(staff, 'create_invite_link', { ...INVITE, discountCodeId: d.id });
    await call(owner, 'revoke_discount_code', { id: d.id });
    expect((await fails(call(staff, 'create_invite_link', { ...INVITE, discountCodeId: d.id }))).code).toBe('invalid_input');
  });

  it('revoke_invite_link sets revoked_at', async () => {
    await call(staff, 'create_invite_link', INVITE);
    const [row] = await dbs.owner.select().from(agencyInviteLink);
    await call(staff, 'revoke_invite_link', { id: row!.id });
    expect((await dbs.owner.select().from(agencyInviteLink))[0]!.revokedAt).not.toBeNull();
    const listed = (await call(staff, 'list_invite_links', {})) as { links: { revokedAt: string | null }[] };
    expect(listed.links[0]!.revokedAt).not.toBeNull();
  });
});

describe('create_plan_version / list_plans', () => {
  it('creates version max+1, syncs, flips is_current', async () => {
    await call(owner, 'create_plan_version', PLAN_IN);
    const rows = (await dbs.owner.select().from(plan).where(eq(plan.code, 'standard'))).sort((a, b) => a.version - b.version);
    expect(rows.map((r) => [r.version, r.isCurrent])).toEqual([[1, false], [2, true]]);
    expect(rows[1]).toMatchObject({ name: 'Standard v2', basePriceCents: 29900, includedSeats: 5, seatPriceCents: 7900, trialDays: 14, createdBy: 'op' });
    expect(rows[1]!.stripeBasePriceId).toBeTruthy();
    expect(rows[1]!.stripeSeatPriceId).toBeTruthy();
    const listed = (await call(viewer, 'list_plans', {})) as { plans: { version: number; isCurrent: boolean }[] };
    expect(listed.plans.map((p) => p.version)).toEqual([2, 1]);
  });

  it('a Stripe failure writes nothing and keeps the old current plan', async () => {
    gw.failNext();
    await fails(call(owner, 'create_plan_version', PLAN_IN));
    const rows = await dbs.owner.select().from(plan);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ version: 1, isCurrent: true });
  });
});

describe('admin billing actions', () => {
  it('grant_pilot writes an event via applyBillingSignal with actor = user id', async () => {
    await setBilling({ state: 'trialing', trialEndsAt: new Date(Date.now() + DAY) });
    const endsAt = new Date(Date.now() + 30 * DAY);
    await call(staff, 'grant_pilot', { agencyId: A, endsAt: endsAt.toISOString() });
    expect(await billingRow()).toMatchObject({ state: 'pilot' });
    expect((await billingRow())!.pilotEndsAt!.getTime()).toBe(endsAt.getTime());
    expect((await events()).at(-1)).toMatchObject({ toState: 'pilot', reason: 'admin:grant_pilot', actor: 'staff' });
    expect(await audits('grant_pilot')).toHaveLength(1);
  });

  it('end_pilot moves to trialing using the plan trialDays', async () => {
    await setBilling({ state: 'pilot' });
    await call(staff, 'end_pilot', { agencyId: A });
    const row = (await billingRow())!;
    expect(row.state).toBe('trialing');
    expect((row.trialEndsAt!.getTime() - Date.now()) / DAY).toBeGreaterThan(29.9);
    expect((await events()).at(-1)).toMatchObject({ reason: 'admin:end_pilot', actor: 'staff' });
  });

  it('extend_trial sets trial_ends_at', async () => {
    await setBilling({ state: 'trialing', trialEndsAt: new Date(Date.now() + DAY) });
    const until = new Date(Date.now() + 20 * DAY);
    await call(staff, 'extend_trial', { agencyId: A, until: until.toISOString() });
    expect((await billingRow())!.trialEndsAt!.getTime()).toBe(until.getTime());
    expect((await events()).at(-1)).toMatchObject({ reason: 'admin:extend_trial' });
  });

  it('a null transition is a conflict and writes nothing', async () => {
    await setBilling({ state: 'active', stripeSubscriptionId: 'sub_1' });
    for (const [name, input] of [['end_pilot', { agencyId: A }], ['extend_trial', { agencyId: A, until: new Date(Date.now() + DAY).toISOString() }]] as const) {
      const e = await fails(call(staff, name, input));
      expect(e.code).toBe('conflict');
      expect(e.message.length).toBeGreaterThan(10);
    }
    expect(await events()).toEqual([]);
  });

  it.each([['grant_pilot', {}], ['extend_trial', { until: new Date(Date.now() + 9 * DAY).toISOString() }]] as const)('%s refuses while the agency has a live Stripe subscription (R26)', async (name, extra) => {
    await setBilling({ state: 'past_due', pastDueSince: new Date(), stripeCustomerId: 'cus_a', stripeSubscriptionId: 'sub_a' });
    gw.seedSubscription({ id: 'sub_a', customerId: 'cus_a', status: 'past_due' });
    const e = await fails(call(staff, name, { agencyId: A, ...extra }));
    expect(e).toMatchObject({ code: 'conflict', message: 'This agency has a live Stripe subscription. Cancel it in Stripe first.' });
    expect(await events()).toEqual([]);
    expect((await billingRow())!.stripeSubscriptionId).toBe('sub_a');
  });

  it.each([['canceled', true], ['missing in Stripe', false]] as const)('grant_pilot proceeds when the stored subscription is %s and forgets it', async (_n, seed) => {
    await setBilling({ state: 'past_due', pastDueSince: new Date(), stripeCustomerId: 'cus_a', stripeSubscriptionId: 'sub_a', billableSeatsSynced: 1 });
    if (seed) gw.seedSubscription({ id: 'sub_a', customerId: 'cus_a', status: 'canceled' });
    await call(staff, 'grant_pilot', { agencyId: A });
    expect(await billingRow()).toMatchObject({ state: 'pilot', stripeSubscriptionId: null, billableSeatsSynced: null, seatSyncPending: false });
  });

  it('grant_pilot fails closed when the subscription lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await setBilling({ state: 'past_due', pastDueSince: new Date(), stripeSubscriptionId: 'sub_a' });
    gw.seedSubscription({ id: 'sub_a', customerId: 'cus_a', status: 'canceled' });
    gw.failNext();
    expect((await fails(call(staff, 'grant_pilot', { agencyId: A }))).code).toBe('internal');
    expect(await events()).toEqual([]);
  });

  it.each([
    ['webhook delivered', true],
    ['webhook missed', false],
  ] as const)('C1 scenario (%s): ended subscription, then grant_pilot; the nightly job keeps the pilot', async (_n, delivered) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Missed: payment failed, Stripe gave up and canceled, and the deletion event never arrived (the id is still stored).
    await setBilling({ state: delivered ? 'active' : 'past_due', pastDueSince: delivered ? null : new Date(), stripeCustomerId: 'cus_a', stripeSubscriptionId: 'sub_a', billableSeatsSynced: 0 });
    gw.seedSubscription({ id: 'sub_a', customerId: 'cus_a', status: 'canceled' });
    if (delivered) {
      await handleStripeEvent(dbs.service, gw, { id: 'evt_end', type: 'customer.subscription.deleted', created: Math.floor(Date.now() / 1000), data: { object: { id: 'sub_a', customer: 'cus_a', status: 'canceled' } } });
      expect(await billingRow()).toMatchObject({ state: 'past_due', stripeSubscriptionId: null });
    }
    await call(staff, 'grant_pilot', { agencyId: A, endsAt: new Date(Date.now() + 90 * DAY).toISOString() });
    for (const d of [1, 8, 40]) await runBillingDaily(dbs.service, gw, new Date(Date.now() + d * DAY));
    expect(await billingRow()).toMatchObject({ state: 'pilot', stripeSubscriptionId: null });
  });

  it('grant_pilot endsAt and extend_trial until must be in the future', async () => {
    await setBilling({ state: 'trialing', trialEndsAt: new Date(Date.now() + DAY) });
    const past = new Date(Date.now() - 60_000).toISOString();
    expect((await fails(call(staff, 'grant_pilot', { agencyId: A, endsAt: past }))).code).toBe('invalid_input');
    expect((await fails(call(staff, 'extend_trial', { agencyId: A, until: past }))).code).toBe('invalid_input');
    expect(await events()).toEqual([]);
  });

  it('unknown agency -> not_found', async () => {
    expect((await fails(call(staff, 'grant_pilot', { agencyId: '99999999-9999-4999-8999-999999999999' }))).code).toBe('not_found');
  });

  it('attach_agency_discount: no subscription stores the coupon only', async () => {
    const d = (await call(owner, 'create_discount_code', CODE)) as { id: string };
    await call(staff, 'attach_agency_discount', { agencyId: A, discountCodeId: d.id });
    const [dc] = await dbs.owner.select().from(discountCode).where(eq(discountCode.id, d.id));
    const row = (await billingRow())!;
    expect(row.attachedCouponId).toBe(dc!.stripeCouponId);
    expect(row.stripeCustomerId).toBeTruthy();
    expect(gw.callsTo('attachSubscriptionDiscount')).toEqual([]);
  });

  it('attach_agency_discount: with a subscription attaches to the subscription (I1)', async () => {
    const d = (await call(owner, 'create_discount_code', CODE)) as { id: string };
    await setBilling({ state: 'active', stripeCustomerId: 'cus_a', stripeSubscriptionId: 'sub_a' });
    gw.seedSubscription({ id: 'sub_a', customerId: 'cus_a' });
    expect(await call(staff, 'attach_agency_discount', { agencyId: A, discountCodeId: d.id })).toEqual({ attached: true, appliesAtCheckout: false });
    const [dc] = await dbs.owner.select().from(discountCode).where(eq(discountCode.id, d.id));
    expect(gw.callsTo('attachSubscriptionDiscount')[0]!.args[0]).toEqual({ subscriptionId: 'sub_a', couponId: dc!.stripeCouponId });
  });

  it('attach_agency_discount refuses revoked or expired codes', async () => {
    const d = (await call(owner, 'create_discount_code', CODE)) as { id: string };
    const e = (await call(owner, 'create_discount_code', { ...CODE, code: 'OLD' })) as { id: string };
    await dbs.owner.update(discountCode).set({ expiresAt: new Date(Date.now() - DAY) }).where(eq(discountCode.id, e.id));
    await call(owner, 'revoke_discount_code', { id: d.id });
    for (const id of [d.id, e.id]) expect((await fails(call(staff, 'attach_agency_discount', { agencyId: A, discountCodeId: id }))).code).toBe('invalid_input');
    expect(await billingRow()).toBeUndefined();
  });

  it('attach_agency_discount refuses a restricted code for an agency outside the list', async () => {
    const d = (await call(owner, 'create_discount_code', { ...CODE, restrictedAgencyIds: [IDS.agencyB] })) as { id: string };
    expect((await fails(call(staff, 'attach_agency_discount', { agencyId: A, discountCodeId: d.id }))).code).toBe('invalid_input');
    expect(await billingRow()).toBeUndefined();
    await call(staff, 'attach_agency_discount', { agencyId: IDS.agencyB, discountCodeId: d.id });
  });

  it('set_seat_cap_exempt reports meaningful only in pilot', async () => {
    await setBilling({ state: 'pilot' });
    expect(await call(owner, 'set_seat_cap_exempt', { agencyId: A, exempt: true })).toEqual({ exempt: true, meaningful: true });
    expect((await billingRow())!.seatCapExempt).toBe(true);
    await dbs.owner.update(agencyBilling).set({ state: 'active' }).where(eq(agencyBilling.agencyId, A));
    expect(await call(owner, 'set_seat_cap_exempt', { agencyId: A, exempt: false })).toEqual({ exempt: false, meaningful: false });
    expect((await billingRow())!.seatCapExempt).toBe(false);
    expect(await audits('set_seat_cap_exempt')).toHaveLength(2);
  });

  it('set_seat_cap_exempt works for an agency with no billing row (pilot)', async () => {
    expect(await call(owner, 'set_seat_cap_exempt', { agencyId: A, exempt: true })).toEqual({ exempt: true, meaningful: true });
    expect((await billingRow())!.seatCapExempt).toBe(true);
  });
});

describe('set_connect_fee_percent', () => {
  const globalFee = async () => (await dbs.owner.select().from(platformSetting).where(eq(platformSetting.key, 'connect_application_fee_percent')))[0];
  const override = async (id = A) => (await dbs.owner.select().from(agencyConnect).where(eq(agencyConnect.agencyId, id)))[0]?.applicationFeePercent;
  const connectRow = (agencyId = A, v: Partial<typeof agencyConnect.$inferInsert> = {}) =>
    dbs.owner.insert(agencyConnect).values({ agencyId, stripeAccountId: `acct_${agencyId.slice(-1)}`, status: 'connected', chargesEnabled: true, ...v });

  it('sets the global fee (null or omitted agencyId) with updated_by and an audit row', async () => {
    expect(await call(owner, 'set_connect_fee_percent', { percent: 2.5 })).toEqual({ agencyId: null, previousPercent: 0, percent: 2.5 });
    expect((await globalFee())).toMatchObject({ value: 2.5, updatedBy: 'op' });
    expect(await call(owner, 'set_connect_fee_percent', { agencyId: null, percent: 3 })).toMatchObject({ previousPercent: 2.5, percent: 3 });
    expect(await dbs.owner.select().from(platformAuditLog).where(eq(platformAuditLog.tool, 'set_connect_fee_percent'))).toHaveLength(2);
  });
  it('sets and clears a per-agency override (null clears; explicit 0 is kept)', async () => {
    await connectRow();
    expect(await call(owner, 'set_connect_fee_percent', { agencyId: A, percent: 1.25 })).toEqual({ agencyId: A, previousPercent: null, percent: 1.25 });
    expect(await override()).toBe('1.25');
    await call(owner, 'set_connect_fee_percent', { agencyId: A, percent: 0 });
    expect(await override()).toBe('0.00');
    expect(await call(owner, 'set_connect_fee_percent', { agencyId: A, percent: null })).toMatchObject({ previousPercent: 0, percent: null });
    expect(await override()).toBeNull();
    expect(await audits('set_connect_fee_percent')).toHaveLength(3); // per-agency writes land in that agency's audit_log
  });
  it('validates range and precision; the global fee needs a number', async () => {
    for (const percent of [-1, 20.01, 21, 1.234, Number.NaN]) {
      expect((await fails(call(owner, 'set_connect_fee_percent', { percent }))).code, String(percent)).toBe('invalid_input');
    }
    expect((await fails(call(owner, 'set_connect_fee_percent', { percent: null }))).code).toBe('invalid_input');
    await call(owner, 'set_connect_fee_percent', { percent: 20 });
    await call(owner, 'set_connect_fee_percent', { percent: 0.05 });
    expect((await globalFee())!.value).toBe(0.05);
  });
  it('an unknown agency is not_found; an agency without a connect row is not_found too', async () => {
    expect((await fails(call(owner, 'set_connect_fee_percent', { agencyId: '00000000-0000-4000-8000-0000000000ff', percent: 1 }))).code).toBe('not_found');
    expect((await fails(call(owner, 'set_connect_fee_percent', { agencyId: A, percent: 1 }))).code).toBe('not_found');
  });
  it('makes no Stripe calls', async () => {
    await call(owner, 'set_connect_fee_percent', { percent: 4 });
    expect(gw.calls).toEqual([]);
  });
});

describe('get_connect_overview', () => {
  const B = IDS.agencyB;
  const cb = (clientId: string, agencyId: string, v: Partial<typeof clientBilling.$inferInsert>) =>
    dbs.owner.insert(clientBilling).values({ clientId, agencyId, enabled: true, state: 'active', billedPriceCents: 9900, ...v });

  it('is empty with no connected agencies', async () => {
    expect(await call(viewer, 'get_connect_overview', {})).toEqual({ globalFeePercent: 0, agencies: [], totals: { connectedAgencies: 0, payingClients: 0, clientMrrCents: 0 } });
  });
  it('lists non-disconnected agencies by name with current client counts and MRR, and totals', async () => {
    await dbs.owner.insert(platformSetting).values({ key: 'connect_application_fee_percent', value: 2, updatedBy: 't' }).onConflictDoUpdate({ target: platformSetting.key, set: { value: 2 } });
    await dbs.owner.insert(agencyConnect).values([
      { agencyId: B, stripeAccountId: 'acct_b', status: 'connected', chargesEnabled: true, applicationFeePercent: '0.00' },
      { agencyId: A, stripeAccountId: 'acct_a', status: 'restricted', chargesEnabled: false },
    ]);
    await cb(IDS.clientB1, B, { billedPriceCents: 5000 });
    await cb(IDS.clientA1, A, {});
    await cb(IDS.clientA2, A, { state: 'payment_needed', billedPriceCents: 7000 });
    const r = (await call(viewer, 'get_connect_overview', {})) as { agencies: Record<string, unknown>[]; totals: unknown; globalFeePercent: number };
    expect(r.globalFeePercent).toBe(2);
    expect(r.agencies).toEqual([
      { agencyId: A, name: 'Agency A', status: 'restricted', chargesEnabled: false, feeOverridePercent: null, payingClients: 1, paymentNeededClients: 1, clientMrrCents: 9900 },
      { agencyId: B, name: 'Agency B', status: 'connected', chargesEnabled: true, feeOverridePercent: 0, payingClients: 1, paymentNeededClients: 0, clientMrrCents: 5000 },
    ]);
    expect(r.totals).toEqual({ connectedAgencies: 1, payingClients: 2, clientMrrCents: 14900 });
    expect(JSON.stringify(r)).not.toMatch(/A1 HVAC|@/);
  });
  it('excludes disconnected agencies and inactive clients', async () => {
    await dbs.owner.insert(agencyConnect).values([
      { agencyId: A, stripeAccountId: 'acct_a', status: 'connected', chargesEnabled: true },
      { agencyId: B, status: 'disconnected', chargesEnabled: false },
    ]);
    await cb(IDS.clientA1, A, {});
    await dbs.owner.update(client).set({ status: 'prospect' }).where(eq(client.id, IDS.clientA1));
    const r = (await call(viewer, 'get_connect_overview', {})) as { agencies: { agencyId: string; payingClients: number; clientMrrCents: number }[] };
    expect(r.agencies.map((a) => a.agencyId)).toEqual([A]);
    expect(r.agencies[0]).toMatchObject({ payingClients: 0, clientMrrCents: 0 });
  });
});

describe('billing not configured (R27: no gateway)', () => {
  const NOT_CONFIGURED = { code: 'conflict', message: 'Billing is not configured.' };
  beforeEach(() => {
    registry = createToolRegistry({ app: dbs.app, service: dbs.service, appUrl: APP, platformAdmins: ['op@example.com'] }, { audit: { record: async () => {} } });
  });

  it('Stripe-backed writes refuse', async () => {
    const [dc] = await dbs.owner.insert(discountCode).values({ code: 'X1', stripeCouponId: 'co_x', stripePromotionCodeId: 'promo_x', percentOff: '10', appliesTo: 'both', duration: 'once', createdBy: 't' }).returning();
    expect(await fails(call(owner, 'create_plan_version', PLAN_IN))).toMatchObject(NOT_CONFIGURED);
    expect(await fails(call(owner, 'create_discount_code', CODE))).toMatchObject(NOT_CONFIGURED);
    expect(await fails(call(staff, 'attach_agency_discount', { agencyId: A, discountCodeId: dc!.id }))).toMatchObject(NOT_CONFIGURED);
    expect(await fails(call(owner, 'revoke_discount_code', { id: dc!.id }))).toMatchObject(NOT_CONFIGURED);
    expect((await dbs.owner.select().from(discountCode))[0]!.revokedAt).toBeNull();
    await setBilling({ state: 'past_due', pastDueSince: new Date(), stripeSubscriptionId: 'sub_a' });
    expect(await fails(call(staff, 'grant_pilot', { agencyId: A }))).toMatchObject(NOT_CONFIGURED);
    expect(await dbs.owner.select().from(plan)).toHaveLength(1);
  });

  it('state actions without a stored subscription, and reads, still work', async () => {
    await setBilling({ state: 'trialing', trialEndsAt: new Date(Date.now() + DAY), stripeCustomerId: 'cus_a' });
    expect(await call(staff, 'grant_pilot', { agencyId: A })).toEqual({ state: 'pilot' });
    expect(await call(viewer, 'get_agency_billing', { agencyId: A })).toMatchObject({ state: 'pilot', invoices: [] });
    const [dc] = await dbs.owner.insert(discountCode).values({ code: 'X2', stripeCouponId: 'co_y', percentOff: '10', appliesTo: 'both', duration: 'once', createdBy: 't' }).returning();
    expect(await call(owner, 'revoke_discount_code', { id: dc!.id })).toEqual({ revoked: true }); // no promotion code to deactivate
  });
});

describe('reads', () => {
  it('get_agency_billing returns the row, invoices and events', async () => {
    await setBilling({ state: 'active', stripeCustomerId: 'cus_a', stripeSubscriptionId: 'sub_a', billableSeatsSynced: 4, seatSyncPending: true, seatCapExempt: true, attachedCouponId: 'coupon_1' });
    gw.seedInvoice('cus_a', { id: 'in_1', amountPaidCents: 22900 });
    await dbs.owner.insert(agencyBillingEvent).values({ agencyId: A, fromState: 'trialing', toState: 'active', reason: 'signal:subscription_active', actor: 'stripe' });
    const r = (await call(viewer, 'get_agency_billing', { agencyId: A })) as Record<string, any>;
    expect(r).toMatchObject({ state: 'active', seatsSynced: 4, seatSyncPending: true, seatCapExempt: true, attachedCouponId: 'coupon_1', stripeCustomerId: 'cus_a', stripeSubscriptionId: 'sub_a' });
    expect(r.plan).toMatchObject({ name: 'Standard', version: 1 });
    expect(r.invoices.map((i: { id: string }) => i.id)).toEqual(['in_1']);
    expect(r.events).toHaveLength(1);
  });

  it('get_agency_billing degrades invoices to [] on gateway failure and defaults to pilot without a row', async () => {
    const empty = (await call(viewer, 'get_agency_billing', { agencyId: A })) as Record<string, any>;
    expect(empty.state).toBe('pilot');
    await setBilling({ stripeCustomerId: 'cus_a' });
    gw.failNext();
    const r = (await call(viewer, 'get_agency_billing', { agencyId: A })) as Record<string, any>;
    expect(r.invoices).toEqual([]);
  });

  it('get_billing_overview sums the latest day and counts states live (no row = pilot)', async () => {
    const d1 = '2026-10-10';
    const d2 = '2026-10-11';
    await dbs.owner.insert(agencyDailyStat).values([
      { agencyId: IDS.agencyA, day: d1, mrrCents: 999, paidSeats: 9 },
      { agencyId: IDS.agencyA, day: d2, mrrCents: 22900, paidSeats: 2 },
      { agencyId: IDS.agencyB, day: d2, mrrCents: 10000, paidSeats: 1 },
    ]);
    await setBilling({ state: 'active' });
    const r = (await call(viewer, 'get_billing_overview', {})) as { mrrCents: number; paidSeats: number; agenciesByState: Record<string, number> };
    expect(r.mrrCents).toBe(32900);
    expect(r.paidSeats).toBe(3);
    const total = (await dbs.owner.select({ id: agency.id }).from(agency)).length;
    expect(r.agenciesByState.active).toBe(1);
    expect(r.agenciesByState.pilot).toBe(total - 1);
  });

  it('get_billing_overview with no stats is zeros', async () => {
    expect(await call(viewer, 'get_billing_overview', {})).toMatchObject({ mrrCents: 0, paidSeats: 0 });
  });

  it('list_discount_codes lists codes without exposing anything secret', async () => {
    await call(owner, 'create_discount_code', CODE);
    const r = (await call(viewer, 'list_discount_codes', {})) as { codes: { code: string }[] };
    expect(r.codes.map((c) => c.code)).toEqual(['WELCOME20']);
  });
});
