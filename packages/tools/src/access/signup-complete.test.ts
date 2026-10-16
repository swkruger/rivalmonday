import {
  agency, agencyBilling, agencyBillingEvent, agencyInviteLink, agencyOnboarding, agencyProfile, billingNotice, contact, discountCode, membership,
  pendingSignup, plan,
} from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seedUser, truncateAuth } from '../../test/fixtures';
import { completePendingSignups, enqueueSignupEmails } from './signup-complete';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const NOW = new Date('2026-10-15T12:00:00Z');
const DAY = 86_400_000;
const USER = { id: 'u1', email: 'Owner@NewAgency.co', name: 'Pat Owner' };

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.insert(plan).values({ code: 'standard', version: 1, name: 'Standard', basePriceCents: 22900, includedSeats: 3, seatPriceCents: 9900, trialDays: 30, isCurrent: true, createdBy: 'test' });
  await seedUser(dbs.owner, USER.id, USER.email);
});

const pending = async (o: Partial<typeof pendingSignup.$inferInsert> = {}) => {
  const [r] = await dbs.service.insert(pendingSignup).values({
    email: 'owner@newagency.co', agencyName: 'New Agency', contactName: 'Pat', source: 'open', ipHash: 'h'.repeat(64), createdAt: NOW, expiresAt: new Date(NOW.getTime() + DAY), ...o,
  }).returning();
  return r!;
};
const link = async (o: Partial<typeof agencyInviteLink.$inferInsert> = {}) => {
  const [r] = await dbs.service.insert(agencyInviteLink).values({
    tokenHash: `hash-${Math.random()}`, tokenPrefix: 'rm_inv_x', offer: 'pilot', expiresAt: new Date(NOW.getTime() + 7 * DAY), createdBy: 'staff', ...o,
  }).returning();
  return r!;
};
const code = async (o: Partial<typeof discountCode.$inferInsert> = {}) => {
  const [r] = await dbs.service.insert(discountCode).values({
    code: `C${Math.random()}`, stripeCouponId: 'co_pilot', percentOff: '50', appliesTo: 'both', duration: 'forever', createdBy: 'staff', ...o,
  }).returning();
  return r!;
};
const newAgencies = async () => (await dbs.owner.select().from(agency)).filter((a) => a.id !== IDS.agencyA && a.id !== IDS.agencyB);

describe('completePendingSignups', () => {
  it('uses the sign-up contact name for the admin contact when the user has no name (magic link)', async () => {
    await pending();
    const r = await completePendingSignups(dbs.service, { ...USER, name: '' }, NOW);
    const [c] = await dbs.owner.select().from(contact).where(eq(contact.agencyId, r.agencyIds[0]!));
    expect(c).toMatchObject({ role: 'agency_admin', name: 'Pat' });
  });

  it('open sign-up: agency, profile, admin membership + contact, open onboarding, trialing billing, emails, row completed', async () => {
    const p = await pending();
    const r = await completePendingSignups(dbs.service, USER, NOW);
    expect(r.problems).toEqual([]);
    expect(r.agencyIds).toHaveLength(1);
    const id = r.agencyIds[0]!;
    const [a] = await dbs.owner.select().from(agency).where(eq(agency.id, id));
    expect(a).toMatchObject({ name: 'New Agency', branding: null });
    const [prof] = await dbs.owner.select().from(agencyProfile).where(eq(agencyProfile.agencyId, id));
    expect(prof).toMatchObject({ contactName: 'Pat', contactEmail: 'owner@newagency.co' });
    const [m] = await dbs.owner.select().from(membership).where(eq(membership.agencyId, id));
    expect(m).toMatchObject({ userId: 'u1', role: 'agency_admin', clientId: null, createdBy: 'u1' });
    const [c] = await dbs.owner.select().from(contact).where(eq(contact.id, m!.contactId!));
    expect(c).toMatchObject({ agencyId: id, role: 'agency_admin', userId: 'u1', clientId: null, email: 'owner@newagency.co', name: 'Pat Owner' });
    const [ob] = await dbs.owner.select().from(agencyOnboarding).where(eq(agencyOnboarding.agencyId, id));
    expect(ob).toMatchObject({ source: 'open', inviteLinkId: null });
    // R3: the billing row is a trial (never a default 3-seat pilot), with no Stripe customer and no trial_started notice.
    const [b] = await dbs.owner.select().from(agencyBilling).where(eq(agencyBilling.agencyId, id));
    expect(b).toMatchObject({ state: 'trialing', stripeCustomerId: null, attachedCouponId: null, trialEndsAt: new Date(NOW.getTime() + 30 * DAY) });
    expect(await dbs.owner.select().from(agencyBillingEvent).where(eq(agencyBillingEvent.agencyId, id))).toHaveLength(1);
    const notices = await dbs.owner.select().from(billingNotice).where(eq(billingNotice.agencyId, id));
    expect(notices.map((n) => n.kind).sort()).toEqual(['agency_welcome', 'platform_signup_notice']);
    expect(notices.find((n) => n.kind === 'agency_welcome')).toMatchObject({ dedupeKey: `signup_welcome:${id}`, params: { agencyName: 'New Agency' }, audience: 'agency', clientId: null });
    expect(notices.find((n) => n.kind === 'platform_signup_notice')).toMatchObject({
      dedupeKey: `signup_notice:${id}`, audience: 'agency', clientId: null,
      params: { agencyName: 'New Agency', contactName: 'Pat', email: 'owner@newagency.co', source: 'open', offer: 'trial', pilotEndsAt: null },
    });
    const [row] = await dbs.owner.select().from(pendingSignup).where(eq(pendingSignup.id, p.id));
    expect(row).toMatchObject({ completedAt: NOW, completedAgencyId: id });
  });

  it('is a no-op the second time (row already completed)', async () => {
    await pending();
    await completePendingSignups(dbs.service, USER, NOW);
    expect(await completePendingSignups(dbs.service, USER, NOW)).toEqual({ agencyIds: [], problems: [] });
    expect(await newAgencies()).toHaveLength(1);
  });

  it('invite pilot: pilot billing with pilot_ends_at and the coupon, consumes one use, onboarding source invite', async () => {
    const dc = await code();
    const endsAt = new Date('2027-01-31T00:00:00Z');
    const l = await link({ offer: 'pilot', pilotEndsAt: endsAt, discountCodeId: dc.id, maxUses: 3 });
    await pending({ source: 'invite', inviteLinkId: l.id });
    const r = await completePendingSignups(dbs.service, USER, NOW);
    const id = r.agencyIds[0]!;
    const [b] = await dbs.owner.select().from(agencyBilling).where(eq(agencyBilling.agencyId, id));
    expect(b).toMatchObject({ state: 'pilot', pilotEndsAt: endsAt, trialEndsAt: null, attachedCouponId: 'co_pilot' });
    expect((await dbs.owner.select().from(agencyInviteLink).where(eq(agencyInviteLink.id, l.id)))[0]!.uses).toBe(1);
    expect((await dbs.owner.select().from(agencyOnboarding).where(eq(agencyOnboarding.agencyId, id)))[0]).toMatchObject({ source: 'invite', inviteLinkId: l.id });
    const [n] = await dbs.owner.select().from(billingNotice).where(eq(billingNotice.dedupeKey, `signup_notice:${id}`));
    expect(n!.params).toMatchObject({ source: 'invite', offer: 'pilot', pilotEndsAt: endsAt.toISOString() });
  });

  it('invite trial: trialing; a revoked or expired discount code attaches no coupon', async () => {
    for (const dc of [await code({ revokedAt: NOW }), await code({ expiresAt: NOW })]) {
      const l = await link({ offer: 'trial', discountCodeId: dc.id });
      await dbs.service.delete(pendingSignup);
      await pending({ source: 'invite', inviteLinkId: l.id });
      const id = (await completePendingSignups(dbs.service, USER, NOW)).agencyIds[0]!;
      expect((await dbs.owner.select().from(agencyBilling).where(eq(agencyBilling.agencyId, id)))[0]).toMatchObject({ state: 'trialing', attachedCouponId: null });
    }
  });

  it('two concurrent completions for the same user create one agency and consume one invite use', async () => {
    const l = await link({ offer: 'pilot', maxUses: 5 });
    await pending({ source: 'invite', inviteLinkId: l.id });
    // Hold the pending row's lock so both calls pass their initial read and then queue on FOR UPDATE together.
    let release!: () => void;
    const gate = new Promise<void>((res) => (release = res));
    let locked!: () => void;
    const isLocked = new Promise<void>((res) => (locked = res));
    const holder = dbs.owner.transaction(async (tx) => {
      await tx.select().from(pendingSignup).for('update');
      locked();
      await gate;
    });
    await isLocked;
    const both = Promise.all([completePendingSignups(dbs.service, USER, NOW), completePendingSignups(dbs.service, USER, NOW)]);
    for (let i = 0; i < 100; i++) {
      const [w] = await dbs.owner.execute<{ n: number }>(sql`select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%pending_signup%'`);
      if (w!.n >= 2) break;
      await new Promise((res) => setTimeout(res, 50));
    }
    const [waiting] = await dbs.owner.execute<{ n: number }>(sql`select count(*)::int as n from pg_stat_activity where wait_event_type = 'Lock' and query ilike '%pending_signup%'`);
    expect(waiting!.n).toBe(2);
    release();
    await holder;
    const [r1, r2] = await both;
    expect([...r1.agencyIds, ...r2.agencyIds]).toHaveLength(1);
    expect(await newAgencies()).toHaveLength(1);
    expect(await dbs.owner.select().from(agencyBilling)).toHaveLength(1);
    expect((await dbs.owner.select().from(agencyInviteLink).where(eq(agencyInviteLink.id, l.id)))[0]!.uses).toBe(1);
  });

  it.each([
    ['link_revoked', { revokedAt: new Date(NOW.getTime() - 1000) }],
    ['link_used_up', { uses: 1, maxUses: 1 }],
    ['link_expired', { expiresAt: NOW }],
    ['email_lock_mismatch', { emailLock: 'someone@else.co' }],
  ] as const)('a link that became %s after submit creates nothing and leaves the row open', async (problem, o) => {
    const l = await link(o);
    const p = await pending({ source: 'invite', inviteLinkId: l.id });
    expect(await completePendingSignups(dbs.service, USER, NOW)).toEqual({ agencyIds: [], problems: [problem] });
    expect(await newAgencies()).toEqual([]);
    expect(await dbs.owner.select().from(membership).where(eq(membership.userId, 'u1'))).toEqual([]);
    expect(await dbs.owner.select().from(billingNotice)).toEqual([]);
    expect((await dbs.owner.select().from(agencyInviteLink).where(eq(agencyInviteLink.id, l.id)))[0]!.uses).toBe(l.uses);
    expect((await dbs.owner.select().from(pendingSignup).where(eq(pendingSignup.id, p.id)))[0]!.completedAt).toBeNull();
  });

  it('a matching email lock (any case) completes', async () => {
    const l = await link({ emailLock: 'owner@newagency.co' });
    await pending({ source: 'invite', inviteLinkId: l.id });
    expect((await completePendingSignups(dbs.service, USER, NOW)).agencyIds).toHaveLength(1);
  });

  it('an existing member of agency A gets a second membership; agency A is unchanged', async () => {
    await dbs.service.insert(membership).values({ userId: 'u1', agencyId: IDS.agencyA, role: 'account_manager', createdBy: 'x' });
    const before = await dbs.owner.select().from(membership).where(eq(membership.agencyId, IDS.agencyA));
    await pending();
    const id = (await completePendingSignups(dbs.service, USER, NOW)).agencyIds[0]!;
    const mine = await dbs.owner.select().from(membership).where(eq(membership.userId, 'u1'));
    expect(mine.map((m) => m.agencyId).sort()).toEqual([IDS.agencyA, id].sort());
    expect(await dbs.owner.select().from(membership).where(eq(membership.agencyId, IDS.agencyA))).toEqual(before);
    expect(await dbs.owner.select().from(agencyBilling).where(eq(agencyBilling.agencyId, IDS.agencyA))).toEqual([]);
  });

  it('ignores an expired or already-completed row and another email', async () => {
    await pending({ expiresAt: NOW });
    await pending({ email: 'other@newagency.co' });
    expect(await completePendingSignups(dbs.service, USER, NOW)).toEqual({ agencyIds: [], problems: [] });
    expect(await newAgencies()).toEqual([]);
  });
});

describe('enqueueSignupEmails', () => {
  it('is idempotent per agency (dedupe keys)', async () => {
    const p = await pending();
    await dbs.service.transaction(async (tx) => {
      await enqueueSignupEmails(tx, IDS.agencyA, p, NOW);
      await enqueueSignupEmails(tx, IDS.agencyA, p, NOW);
    });
    expect(await dbs.owner.select().from(billingNotice)).toHaveLength(2);
  });
});
