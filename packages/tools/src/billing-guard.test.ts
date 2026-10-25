import { type AccessContext, createAccessContext } from '@cs/core';
import { agency, agencyBilling, plan } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { assertAgencyServiceable, billingWriteGuard } from './billing-guard';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const ctx = (role: AccessContext['role']) => createAccessContext({ agencyId: IDS.agencyA, userId: `u-${role}`, role, clientScope: role === 'client_owner' ? [IDS.clientA1] : 'all', features: [] });
const tool = (name: string) => ({ name }) as never;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  const [p] = await dbs.owner
    .insert(plan)
    .values({ code: 'standard', version: 1, name: 'Standard', basePriceCents: 22900, includedSeats: 3, seatPriceCents: 9900, trialDays: 30, isCurrent: true, createdBy: 'test' })
    .returning({ id: plan.id });
  await dbs.owner.insert(agencyBilling).values({ agencyId: IDS.agencyA, state: 'active', planId: p!.id });
  await dbs.owner.update(agency).set({ suspendedAt: new Date(), suspendedReason: 'unpaid invoice', suspendedBy: 'staff-1' }).where(eq(agency.id, IDS.agencyA));
});

describe('billingWriteGuard on a held agency', () => {
  const guard = billingWriteGuard({ app: dbs.app, service: dbs.service });

  it('hold beats active Stripe state', async () => {
    await expect(guard(ctx('agency_admin'), tool('create_client'))).rejects.toMatchObject({
      code: 'service_paused',
      message: 'This account is on hold. Contact support@rivalmonday.app to restore it.',
    });
    await expect(guard(ctx('client_owner'), tool('create_client'))).rejects.toMatchObject({ code: 'service_paused', message: "Your agency's account needs attention." });
    await expect(guard(ctx('agency_admin'), tool('create_portal_session'))).resolves.toBeUndefined();
  });

  it('uses deps.supportEmail in the hold copy', async () => {
    const g = billingWriteGuard({ app: dbs.app, service: dbs.service, supportEmail: 'help@x.test' });
    await expect(g(ctx('agency_admin'), tool('create_client'))).rejects.toThrow('help@x.test');
  });
});

describe('assertAgencyServiceable', () => {
  it('names the support email when given', async () => {
    await expect(assertAgencyServiceable(dbs.service, ctx('agency_admin'), 'help@x.test')).rejects.toMatchObject({ code: 'service_paused', message: expect.stringContaining('help@x.test') });
  });
});
