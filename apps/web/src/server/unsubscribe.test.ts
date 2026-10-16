import { agencyOnboarding } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { unsubscribeToken } from '@cs/tools';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { unsubscribeFromTips, unsubscribeTarget } from './unsubscribe';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());
const SECRET = 'web-test-auth-secret-0123456789abcdefghijkl';
const at = async () => (await dbs.owner.select({ u: agencyOnboarding.unsubscribedAt }).from(agencyOnboarding).where(eq(agencyOnboarding.agencyId, IDS.agencyA)))[0]?.u ?? null;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.insert(agencyOnboarding).values({ agencyId: IDS.agencyA, source: 'open' });
});

describe('unsubscribeTarget', () => {
  it('a valid token resolves to the agency and its name; reading changes nothing', async () => {
    const t = await unsubscribeTarget(dbs.service, unsubscribeToken(IDS.agencyA, SECRET), SECRET);
    expect(t).toEqual({ agencyId: IDS.agencyA, agencyName: expect.any(String) });
    expect(t!.agencyName.length).toBeGreaterThan(0);
    expect(await at()).toBeNull();
  });

  it('a tampered token, another secret or an unknown agency → null', async () => {
    const good = unsubscribeToken(IDS.agencyA, SECRET);
    const tampered = `${good.slice(0, 20)}${good[20] === 'A' ? 'B' : 'A'}${good.slice(21)}`;
    expect(await unsubscribeTarget(dbs.service, tampered, SECRET)).toBeNull();
    expect(await unsubscribeTarget(dbs.service, good, `${SECRET}x`)).toBeNull();
    expect(await unsubscribeTarget(dbs.service, unsubscribeToken('11111111-2222-4333-8444-555555555555', SECRET), SECRET)).toBeNull();
  });
});

describe('unsubscribeFromTips', () => {
  it('sets unsubscribed_at once and keeps the first timestamp on repeats', async () => {
    const t1 = new Date('2026-10-16T10:00:00.000Z');
    await unsubscribeFromTips(dbs.service, IDS.agencyA, t1);
    expect(await at()).toEqual(t1);
    await unsubscribeFromTips(dbs.service, IDS.agencyA, new Date('2026-10-17T10:00:00.000Z'));
    expect(await at()).toEqual(t1);
  });

  it('an agency with no onboarding row is a no-op', async () => {
    await expect(unsubscribeFromTips(dbs.service, IDS.agencyB, new Date())).resolves.toBeUndefined();
  });
});
