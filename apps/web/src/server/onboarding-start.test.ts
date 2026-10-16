import { agency, agencyOnboarding, membership, pendingSignup } from '@cs/db';
import { openTestDbs, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { truncateAuth } from '../../test/auth-fixtures';
import { onboardingStartTarget } from './onboarding-start';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const NOW = new Date('2026-10-15T12:00:00Z');
const USER = { id: 'u1', email: 'Founder@Fresh.co' };

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await truncateAuth(dbs.owner);
  await dbs.owner.execute(`insert into auth."user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ('u1', '', 'founder@fresh.co', true, now(), now())` as never);
});

async function agencyFor(name: string, o: { role?: string; at: string; completed?: boolean; dismissed?: boolean; onboarding?: boolean }) {
  const [a] = await dbs.owner.insert(agency).values({ name }).returning();
  const [m] = await dbs.owner.insert(membership).values({ userId: 'u1', agencyId: a!.id, role: o.role ?? 'agency_admin', createdBy: 't', createdAt: new Date(o.at) }).returning();
  if (o.onboarding !== false) {
    await dbs.owner.insert(agencyOnboarding).values({ agencyId: a!.id, source: 'open', completedAt: o.completed ? NOW : null, dismissedAt: o.dismissed ? NOW : null });
  }
  return { agencyId: a!.id, membershipId: m!.id };
}

describe('onboardingStartTarget', () => {
  it('picks the newest admin membership with an open wizard, not the oldest', async () => {
    await agencyFor('Old', { at: '2026-01-01T00:00:00Z' });
    const fresh = await agencyFor('Fresh', { at: '2026-10-15T11:59:00Z' });
    expect(await onboardingStartTarget(dbs.service, USER, NOW)).toEqual({ path: '/onboarding', membershipId: fresh.membershipId });
  });
  it('skips completed, dismissed, non-admin and onboarding-less memberships', async () => {
    await agencyFor('Done', { at: '2026-10-01T00:00:00Z', completed: true });
    await agencyFor('Dismissed', { at: '2026-10-02T00:00:00Z', dismissed: true });
    await agencyFor('Manager', { at: '2026-10-03T00:00:00Z', role: 'account_manager' });
    await agencyFor('Legacy', { at: '2026-10-04T00:00:00Z', onboarding: false });
    expect(await onboardingStartTarget(dbs.service, USER, NOW)).toEqual({ path: '/agency' });
  });
  it('no membership but an open pending sign-up goes to the problem page', async () => {
    await dbs.service.insert(pendingSignup).values({ email: 'founder@fresh.co', agencyName: 'Fresh', source: 'invite', ipHash: 'h'.repeat(64), expiresAt: new Date(NOW.getTime() + 3_600_000) });
    expect(await onboardingStartTarget(dbs.service, USER, NOW)).toEqual({ path: '/sign-up/problem' });
  });
  it('a completed pending row does not count; no membership and nothing pending goes to /agency', async () => {
    await dbs.service.insert(pendingSignup).values({ email: 'founder@fresh.co', agencyName: 'Fresh', source: 'open', ipHash: 'h'.repeat(64), expiresAt: new Date(NOW.getTime() + 3_600_000), completedAt: NOW });
    expect(await onboardingStartTarget(dbs.service, USER, NOW)).toEqual({ path: '/agency' });
    await dbs.owner.delete(pendingSignup).where(eq(pendingSignup.email, 'founder@fresh.co'));
    expect(await onboardingStartTarget(dbs.service, USER, NOW)).toEqual({ path: '/agency' });
  });
});
