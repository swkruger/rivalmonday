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
const PLATFORM = { kind: 'platform' } as const;
const MCP = { kind: 'mcp' } as const;
const hostOf = (agencyId: string) => ({ kind: 'agency', agencyId, canonical: true, canonicalOrigin: 'https://x.neutral.example' }) as const;

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(agency).set({ branding: { displayName: 'Cool Comfort', primary: '#112233' } }).where(eq(agency.id, IDS.agencyA));
});

describe('authBranding (15a §2.10, P4)', () => {
  it("a client hint resolves to that client's agency branding", async () => {
    const b = await authBranding(dbs.service, env(), { clientId: IDS.clientA1 }, PLATFORM);
    expect(b?.displayName).toBe('Cool Comfort');
    expect(b?.primary).toBe('#112233');
    expect((await authBranding(dbs.service, env(), { clientId: IDS.clientB1 }, PLATFORM))?.displayName).toBe('Agency B');
  });

  it('an agency hint resolves to that agency', async () => {
    expect((await authBranding(dbs.service, env(), { agencyId: IDS.agencyB }, PLATFORM))?.displayName).toBe('Agency B');
  });

  it('no hint, an unknown client or a malformed id falls back to DEFAULT_AGENCY_ID, else null (neutral card)', async () => {
    expect(await authBranding(dbs.service, env(), null, PLATFORM)).toBeNull();
    expect(await authBranding(dbs.service, env(), { clientId: UNKNOWN }, PLATFORM)).toBeNull();
    expect(await authBranding(dbs.service, env(), { clientId: 'not-a-uuid' }, PLATFORM)).toBeNull();
    expect(await authBranding(dbs.service, env(), { agencyId: "x' or 1=1" }, PLATFORM)).toBeNull();
    expect((await authBranding(dbs.service, env(IDS.agencyB), null, PLATFORM))?.displayName).toBe('Agency B');
    expect((await authBranding(dbs.service, env(IDS.agencyB), { clientId: UNKNOWN }, PLATFORM))?.displayName).toBe('Agency B');
    expect((await authBranding(dbs.service, env(IDS.agencyB), { clientId: IDS.clientA1 }, PLATFORM))?.displayName).toBe('Cool Comfort');
  });

  it('an unknown DEFAULT_AGENCY_ID is neutral too (never Rival Monday)', async () => {
    expect(await authBranding(dbs.service, env(UNKNOWN), null, PLATFORM)).toBeNull();
  });
});

describe('authBranding per host (13a1)', () => {
  it('authBranding on an agency host ignores a hint for another agency', async () => {
    const onA = hostOf(IDS.agencyA);
    expect((await authBranding(dbs.service, env(), { agencyId: IDS.agencyB }, onA))?.displayName).toBe('Cool Comfort');
    expect((await authBranding(dbs.service, env(), { clientId: IDS.clientB1 }, onA))?.displayName).toBe('Cool Comfort');
    expect((await authBranding(dbs.service, env(IDS.agencyB), null, onA))?.displayName).toBe('Cool Comfort');
    expect(await authBranding(dbs.service, env(), null, hostOf(UNKNOWN))).toBeNull();
  });

  it('authBranding is null on the mcp host without a hint (no DEFAULT_AGENCY_ID fallback)', async () => {
    expect(await authBranding(dbs.service, env(), null, MCP)).toBeNull();
    expect(await authBranding(dbs.service, env(IDS.agencyB), null, MCP)).toBeNull();
    expect(await authBranding(dbs.service, env(IDS.agencyB), { clientId: UNKNOWN }, MCP)).toBeNull();
  });

  it('authBranding on the mcp host with a hint uses that agency', async () => {
    expect((await authBranding(dbs.service, env(), { agencyId: IDS.agencyB }, MCP))?.displayName).toBe('Agency B');
    expect((await authBranding(dbs.service, env(IDS.agencyB), { clientId: IDS.clientA1 }, MCP))?.displayName).toBe('Cool Comfort');
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
