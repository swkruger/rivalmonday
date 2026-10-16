import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IDS, errorText, openTestDbs, seedTenancy, truncateAll } from '../test/helpers';
import { agencyServiceable } from './filters';
import { agency, agencyBilling, agencyBillingEvent, agencyDailyStat, agencyInviteLink, billingNotice, discountCode, plan, stripeEvent } from './schema';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
});

const std = { code: 'standard', version: 1, name: 'Standard', basePriceCents: 22900, includedSeats: 3, seatPriceCents: 9900, trialDays: 30, createdBy: 'test' };

describe('billing tables', () => {
  it('are invisible to app_user and forced-RLS', async () => {
    for (const t of [plan, agencyBilling, agencyBillingEvent, stripeEvent, discountCode, agencyInviteLink, billingNotice]) {
      expect(await errorText(dbs.app.select().from(t))).toMatch(/permission denied/);
    }
    const rows = (await dbs.owner.execute(sql`
      SELECT relname, relrowsecurity AS rls, relforcerowsecurity AS force FROM pg_class
      WHERE relname IN ('plan','agency_billing','agency_billing_event','stripe_event','discount_code','agency_invite_link','billing_notice')`)) as unknown as { rls: boolean; force: boolean }[];
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.rls && r.force)).toBe(true);
  });

  it('allows one current plan per code but several non-current versions', async () => {
    await dbs.service.insert(plan).values({ ...std, isCurrent: true });
    await dbs.service.insert(plan).values({ ...std, version: 2, isCurrent: false });
    expect(await errorText(dbs.service.insert(plan).values({ ...std, version: 3, isCurrent: true }))).toMatch(/plan_current_uq/);
    expect(await errorText(dbs.service.insert(plan).values({ ...std, version: 2 }))).toMatch(/plan_code_version_uq/);
    expect(await errorText(dbs.service.insert(plan).values({ ...std, code: 'x', trialDays: 91 }))).toMatch(/plan_trial_days_check/);
  });

  it('discount_code needs exactly one of percent_off / amount_off_cents', async () => {
    const base = { code: 'A', stripeCouponId: 'c', appliesTo: 'both' as const, duration: 'once' as const, createdBy: 't' };
    expect(await errorText(dbs.service.insert(discountCode).values(base))).toMatch(/discount_code_off_xor_check/);
    expect(await errorText(dbs.service.insert(discountCode).values({ ...base, percentOff: '10', amountOffCents: 500 }))).toMatch(/discount_code_off_xor_check/);
    await dbs.service.insert(discountCode).values({ ...base, percentOff: '10' });
    await dbs.service.insert(discountCode).values({ ...base, code: 'B', amountOffCents: 500, restrictedAgencyIds: [IDS.agencyA] });
    expect(await dbs.service.select().from(discountCode)).toHaveLength(2);
  });

  it('agency_billing rejects an unknown state and cascades with the agency; billing_notice dedupes', async () => {
    expect(await errorText(dbs.service.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'bogus' as never }))).toMatch(/agency_billing_state_check/);
    await dbs.service.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'trialing' });
    await dbs.service.insert(billingNotice).values({ agencyId: IDS.agencyA, kind: 'trial-started', dedupeKey: 'k1' });
    expect(await errorText(dbs.service.insert(billingNotice).values({ agencyId: IDS.agencyA, kind: 'trial-started', dedupeKey: 'k1' }))).toMatch(/duplicate key/);
    await dbs.owner.execute(sql`delete from agency where id = ${IDS.agencyA}`);
    expect(await dbs.service.select().from(agencyBilling)).toHaveLength(0);
    expect(await dbs.service.select().from(billingNotice)).toHaveLength(0);
  });

  it('agency_daily_stat has nullable mrr_cents, paid_seats and billing_state', async () => {
    await dbs.service.insert(agencyDailyStat).values({ agencyId: IDS.agencyA, day: '2026-10-01' });
    const [row] = await dbs.service.select().from(agencyDailyStat);
    expect([row?.mrrCents, row?.paidSeats, row?.billingState]).toEqual([null, null, null]);
  });

  it('migration 0058 backfill gives every existing agency a pilot row on the standard v1 plan', async () => {
    const stmts = readFileSync(join(__dirname, '../migrations/0058_billing_rls.sql'), 'utf8').split('--> statement-breakpoint').slice(-2);
    for (const s of stmts) await dbs.owner.execute(sql.raw(s));
    const agencies = await dbs.owner.select().from(agency);
    const rows = await dbs.service.select().from(agencyBilling);
    expect(agencies.length).toBeGreaterThan(0);
    expect(rows).toHaveLength(agencies.length);
    expect(rows.every((r) => r.state === 'pilot' && r.pilotEndsAt === null && r.planId !== null)).toBe(true);
    const [p] = await dbs.service.select().from(plan).where(eq(plan.id, rows[0]!.planId!));
    expect([p?.code, p?.version, p?.basePriceCents, p?.includedSeats, p?.seatPriceCents, p?.trialDays, p?.isCurrent]).toEqual(['standard', 1, 22900, 3, 9900, 30, true]);
  });
});

describe('agencyServiceable', () => {
  const serviceable = async () =>
    (await dbs.service.select({ id: agency.id }).from(agency).where(agencyServiceable(agency.id))).map((r) => r.id);

  it('treats an agency without a billing row as serviceable', async () => {
    expect(await serviceable()).toContain(IDS.agencyA);
  });

  it.each([
    ['pilot', true],
    ['trialing', true],
    ['active', true],
    ['past_due', true],
    ['cancelled', true],
    ['read_only', false],
    ['suspended', false],
  ] as const)('state %s -> serviceable=%s', async (state, ok) => {
    await dbs.service.insert(agencyBilling).values({ agencyId: IDS.agencyA, state });
    const ids = await serviceable();
    expect(ids.includes(IDS.agencyA)).toBe(ok);
  });
});
