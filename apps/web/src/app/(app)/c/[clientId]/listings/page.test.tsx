// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ features: ['dashboard'] as string[], audit: null as unknown, calls: [] as [string, unknown][] }));

vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: 'client_owner', features: new Set(m.features) } }) }));
vi.mock('@/server/tools', () => {
  const impl = async (_c: unknown, name: string, input: unknown) => {
    m.calls.push([name, input]);
    if (name === 'get_citation_audit') return m.audit;
    return { name: 'Lone Star Cooling', timezone: 'UTC' };
  };
  return { callTool: impl, tryCallTool: impl };
});
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set() }));
vi.mock('@/server/viewer-tz', () => ({ viewerTimeZone: async () => 'America/Chicago' }));
vi.mock('@/components/help/help-tip', () => ({ HelpTip: () => null }));
vi.mock('@/components/help/help-context', () => ({ HelpText: ({ text }: { text: string }) => <>{text}</> }));
vi.mock('@/components/page-header', () => ({
  PageHeader: ({ title, tone, description }: { title: string; tone?: string; description: React.ReactNode }) => <div data-testid="page-header" data-title={title} data-tone={tone}>{description}</div>,
}));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import ListingsPage from './page';

const C = '00000000-0000-4000-8000-0000000000c1';
const directories = [
  { host: 'facebook.com', label: 'Facebook', addListingUrl: 'https://www.facebook.com/pages/create' },
  { host: 'bbb.org', label: 'Better Business Bureau', addListingUrl: 'https://www.bbb.org/get-listed' },
  { host: 'yellowpages.com', label: 'Yellow Pages', addListingUrl: 'https://www.yellowpages.com/claim-your-listing' },
  { host: 'manta.com', label: 'Manta', addListingUrl: 'https://www.manta.com/business-listings/add-your-company' },
];
const row = (host: string, status: 'listed' | 'not_found' | 'not_checked', o: Record<string, unknown> = {}) => ({
  host, status, nameMatch: null, phoneMatch: null, listingUrl: null, shownPhone: null, evidenceId: null, checkedAt: status === 'not_checked' ? null : '2026-11-02T15:00:00.000Z', ...o,
});
const self = {
  competitorId: '00000000-0000-4000-8000-0000000000a1', name: 'Lone Star Cooling', self: true,
  listings: [
    row('facebook.com', 'listed', { nameMatch: true, phoneMatch: false, shownPhone: '2145550199', listingUrl: 'https://www.facebook.com/lonestarcooling' }),
    row('bbb.org', 'not_found'),
    row('yellowpages.com', 'not_checked'),
    row('manta.com', 'listed', { nameMatch: false, phoneMatch: true, listingUrl: 'https://www.manta.com/c/lone-star' }),
  ],
};
const rival = {
  competitorId: '00000000-0000-4000-8000-0000000000b1', name: 'Brazos Air', self: false,
  listings: [row('facebook.com', 'not_found'), row('bbb.org', 'listed'), row('yellowpages.com', 'listed'), row('manta.com', 'not_checked')],
};
const audit = (o: Record<string, unknown> = {}) => ({
  checkedAt: '2026-11-02T15:00:00.000Z', status: 'done', directories, businesses: [self, rival], selfMissing: false, alsoFoundOn: [], ...o,
});
const visit = () => ListingsPage({ params: Promise.resolve({ clientId: C }) });
const section = (name: string) => screen.getByRole('heading', { name }).closest('section')!;

beforeEach(() => { m.features = ['dashboard']; m.audit = audit(); m.calls = []; });
afterEach(cleanup);

describe('ListingsPage', () => {
  it('reads the profile and the audit via tools, titled Listings with the decided sub-line', async () => {
    render(await visit());
    expect(m.calls.map(([n]) => n).sort()).toEqual(['get_citation_audit', 'get_client_profile']);
    expect(m.calls.every(([, i]) => (i as { clientId: string }).clientId === C)).toBe(true);
    const header = screen.getByTestId('page-header');
    expect([header.dataset.title, header.dataset.tone]).toEqual(['Listings', 'ink']);
    expect(screen.getByText('Where Google search finds you and your top rivals on major directories. Checked every month.')).toBeTruthy();
  });

  it('your listings: one row per directory with the decided chips, name, phone and address copy', async () => {
    render(await visit());
    const s = within(section('Your listings'));
    const rows = s.getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual(['Facebook', 'Better Business Bureau', 'Yellow Pages', 'Manta']);
    expect(rows.map((r) => r.querySelector('[data-slot=status-chip]')!.textContent)).toEqual(['Listed', 'Not found in Google search', 'Not checked yet', 'Listed']);
    expect(rows[0]!.textContent).toContain('Name matches');
    expect(rows[0]!.textContent).toContain('Shows a different phone: (214) 555-0199');
    expect(rows[0]!.textContent).toContain('Address: not checked');
    expect(rows[3]!.textContent).toContain('Name differs');
    expect(rows[3]!.textContent).toContain('Phone matches');
    expect(s.getByText('Checked Nov 2', { exact: false })).toBeTruthy();
  });

  it('"Add listing" only on not-found rows, external; listed rows link to the listing', async () => {
    render(await visit());
    const s = within(section('Your listings'));
    const add = s.getAllByRole('link', { name: 'Add listing' });
    expect(add.map((a) => a.getAttribute('href'))).toEqual(['https://www.bbb.org/get-listed']);
    expect([add[0]!.getAttribute('target'), add[0]!.getAttribute('rel')]).toEqual(['_blank', 'noopener noreferrer']);
    expect(s.getAllByRole('link', { name: /View listing/ }).map((a) => a.getAttribute('href'))).toEqual(['https://www.facebook.com/lonestarcooling', 'https://www.manta.com/c/lone-star']);
    const rows = s.getAllByRole('row').slice(1);
    expect(within(rows[2]!).queryAllByRole('link')).toEqual([]);
  });

  it('you vs top rivals: a matrix of chips, you first then up to 3 rivals', async () => {
    m.audit = audit({ businesses: [self, rival, { ...rival, competitorId: 'r2', name: 'R2' }, { ...rival, competitorId: 'r3', name: 'R3' }, { ...rival, competitorId: 'r4', name: 'R4' }] });
    render(await visit());
    const s = within(section('You vs top rivals'));
    expect(s.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Directory', 'You', 'Brazos Air', 'R2', 'R3']);
    const fb = s.getAllByRole('row')[1]!;
    expect([...fb.querySelectorAll('[data-slot=status-chip]')].map((c) => c.textContent)).toEqual(['Listed', 'Not found in Google search', 'Not found in Google search', 'Not found in Google search']);
  });

  it('also found on: self links only, hidden when empty', async () => {
    render(await visit());
    expect(screen.queryByRole('heading', { name: 'Also found on' })).toBeNull();
    cleanup();
    m.audit = audit({ alsoFoundOn: [{ host: 'nextdoor.com', listingUrl: 'https://nextdoor.com/pages/lone-star', evidenceId: null }] });
    render(await visit());
    const link = within(section('Also found on')).getByRole('link', { name: /nextdoor\.com/ });
    expect([link.getAttribute('href'), link.getAttribute('rel')]).toEqual(['https://nextdoor.com/pages/lone-star', 'noopener noreferrer']);
  });

  it('never checked: the first-check line and no tables', async () => {
    m.audit = audit({ status: 'never', checkedAt: null, businesses: [] });
    render(await visit());
    expect(screen.getByText('Your first check runs once your competitors are set.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'You vs top rivals' })).toBeNull();
  });

  it('no own business: the link-your-listing line, the rival matrix still shown', async () => {
    m.audit = audit({ selfMissing: true, businesses: [rival] });
    render(await visit());
    expect(within(section('Your listings')).getByText('Link your Google listing in Client settings to check your listings.')).toBeTruthy();
    expect(within(section('Your listings')).queryByRole('table')).toBeNull();
    expect(within(section('You vs top rivals')).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Directory', 'Brazos Air']);
  });

  it('404s without the dashboard feature, before any read', async () => {
    m.features = [];
    await expect(visit()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(m.calls).toEqual([]);
  });
});
