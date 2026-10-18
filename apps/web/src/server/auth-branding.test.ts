import { agency } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { authBranding, authHintFromNext, authTitle } from './branding';
import type { WebEnv } from './env';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const env = (defaultAgencyId: string | null = null) => ({ defaultAgencyId }) as WebEnv;
const UNKNOWN = '00000000-0000-4000-8000-00000000dead';

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(agency).set({ branding: { displayName: 'Cool Comfort', primary: '#112233' } }).where(eq(agency.id, IDS.agencyA));
});

describe('authBranding (15a §2.10, P4)', () => {
  it("a client hint resolves to that client's agency branding", async () => {
    const b = await authBranding(dbs.service, env(), { clientId: IDS.clientA1 });
    expect(b?.displayName).toBe('Cool Comfort');
    expect(b?.primary).toBe('#112233');
    expect((await authBranding(dbs.service, env(), { clientId: IDS.clientB1 }))?.displayName).toBe('Agency B');
  });

  it('an agency hint resolves to that agency', async () => {
    expect((await authBranding(dbs.service, env(), { agencyId: IDS.agencyB }))?.displayName).toBe('Agency B');
  });

  it('no hint, an unknown client or a malformed id falls back to DEFAULT_AGENCY_ID, else null (neutral card)', async () => {
    expect(await authBranding(dbs.service, env(), null)).toBeNull();
    expect(await authBranding(dbs.service, env(), { clientId: UNKNOWN })).toBeNull();
    expect(await authBranding(dbs.service, env(), { clientId: 'not-a-uuid' })).toBeNull();
    expect(await authBranding(dbs.service, env(), { agencyId: "x' or 1=1" })).toBeNull();
    expect((await authBranding(dbs.service, env(IDS.agencyB), null))?.displayName).toBe('Agency B');
    expect((await authBranding(dbs.service, env(IDS.agencyB), { clientId: UNKNOWN }))?.displayName).toBe('Agency B');
    expect((await authBranding(dbs.service, env(IDS.agencyB), { clientId: IDS.clientA1 }))?.displayName).toBe('Cool Comfort');
  });

  it('an unknown DEFAULT_AGENCY_ID is neutral too (never Rival Monday)', async () => {
    expect(await authBranding(dbs.service, env(UNKNOWN), null)).toBeNull();
  });
});

describe('authHintFromNext', () => {
  it('takes the client id from a /c/<uuid> path only', () => {
    expect(authHintFromNext(`/c/${IDS.clientA1}`)).toEqual({ clientId: IDS.clientA1 });
    expect(authHintFromNext(`/c/${IDS.clientA1}/briefs/2?x=1`)).toEqual({ clientId: IDS.clientA1 });
    expect(authHintFromNext(`/c/${IDS.clientA1}?tab=a`)).toEqual({ clientId: IDS.clientA1 });
    expect(authHintFromNext('/c/not-a-uuid/briefs')).toBeNull();
    expect(authHintFromNext(`/agency/c/${IDS.clientA1}`)).toBeNull();
    expect(authHintFromNext('/')).toBeNull();
    expect(authHintFromNext(null)).toBeNull();
  });
});

describe('authTitle', () => {
  it('appends the agency display name only when the agency is known', () => {
    expect(authTitle('Sign in', null)).toBe('Sign in');
    expect(authTitle('Sign in', { displayName: 'Cool Comfort' } as never)).toBe('Sign in · Cool Comfort');
  });
});
