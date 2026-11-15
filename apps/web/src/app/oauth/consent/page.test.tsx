// @vitest-environment jsdom
import { agency } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { NEUTRAL_PRODUCT_NAME } from '@cs/mcp';
import { cleanup, render, screen } from '@testing-library/react';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dbs = openTestDbs();
afterAll(() => dbs.closeAll());

const m = vi.hoisted(() => ({ viewer: null as unknown, options: [] as { membershipId: string; label: string; agencyId: string; clientId: string | null; scopes: string[] }[] }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); } }));
vi.mock('@/server/current-viewer', () => ({ getViewer: async () => m.viewer }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: dbs.service }) }));
// DEFAULT_AGENCY_ID is set to agency B: the mcp host must never fall back to it (neutral unless one agency is known).
vi.mock('@/server/env', () => ({ webEnv: () => ({ authSecret: 's'.repeat(40), defaultAgencyId: IDS.agencyB }) }));
vi.mock('@/server/request-host', () => ({ requestHost: async () => ({ origin: 'https://mcp.neutral.example', info: { kind: 'mcp' } }) }));
vi.mock('@better-auth/oauth-provider', () => ({ verifyOAuthQueryParams: async () => true }));
vi.mock('@/server/oauth-consent', async (orig) => ({
  ...(await orig<typeof import('@/server/oauth-consent')>()),
  oauthClientName: async () => ({ name: 'Claude Code' }),
  consentOptions: async () => m.options,
}));
vi.mock('./consent-form', () => ({ ConsentForm: (p: { productName: string | null }) => <p data-testid="product">{p.productName ?? 'none'}</p> }));

const { default: ConsentPage, generateMetadata } = await import('./page');
const SP = { client_id: 'c1', scope: 'read', redirect_uri: 'http://127.0.0.1:1/cb', sig: 'x' };
const open = async () => render(await ConsentPage({ searchParams: Promise.resolve(SP) }));
const opt = (membershipId: string, agencyId: string) => ({ membershipId, label: membershipId, agencyId, clientId: null, scopes: ['read'] });

beforeEach(async () => {
  await truncateAll(dbs.owner);
  await seedTenancy(dbs.owner);
  await dbs.owner.update(agency).set({ branding: { displayName: 'Cool Comfort', primary: '#112233' } }).where(eq(agency.id, IDS.agencyA));
});
afterEach(cleanup);

describe('consent page on the mcp host (13a1 Task 8)', () => {
  it('consent page is neutral before sign-in and agency-branded for one agency', async () => {
    // Signed out: no card at all — straight to the mcp host's sign-in (neutral there, Task 5), with an unbranded title.
    m.viewer = null;
    await expect(ConsentPage({ searchParams: Promise.resolve(SP) })).rejects.toThrow(/^NEXT_REDIRECT:\/sign-in\?next=%2Foauth%2Fconsent%3F/);
    expect(await generateMetadata({ searchParams: Promise.resolve(SP) })).toEqual({ title: 'Connect an app' });

    // Signed in, every option in agency A → agency A's card (not the DEFAULT_AGENCY_ID agency B).
    m.viewer = { kind: 'user', userId: 'u1' };
    m.options = [opt('m1', IDS.agencyA), opt('m2', IDS.agencyA)];
    await open();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Connect Claude Code to Cool Comfort');
    expect(screen.getByTestId('product').textContent).toBe('Cool Comfort');
    expect(await generateMetadata({ searchParams: Promise.resolve(SP) })).toEqual({ title: 'Connect an app · Cool Comfort' });
    cleanup();

    // Options in two agencies → neutral: no agency, no product name, no default agency.
    m.options = [opt('m1', IDS.agencyA), opt('m3', IDS.agencyB)];
    const { container } = await open();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(`Connect Claude Code to ${NEUTRAL_PRODUCT_NAME}`);
    expect(screen.getByTestId('product').textContent).toBe('none');
    expect(container.textContent).not.toMatch(/Cool Comfort|Agency B|Rival Monday/);
  });
});
