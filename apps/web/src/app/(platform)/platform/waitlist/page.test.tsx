// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-provider';

const m = vi.hoisted(() => ({ calls: [] as [string, unknown][], answer: {} as Record<string, unknown>, refuse: false, role: 'staff' }));
vi.mock('@/server/current-viewer', () => ({
  requireOperatorContext: async () => {
    if (m.refuse) throw new Error('NEXT_NOT_FOUND');
    return { viewer: { kind: 'user' }, ctx: { userId: 'op' } };
  },
}));
vi.mock('@/server/tools', () => ({
  callTool: async (_c: unknown, name: string, input: unknown) => {
    m.calls.push([name, input]);
    return name === 'list_help_guides' ? { guides: [] } : m.answer;
  },
  tryCallTool: async () => ({ guides: [] }),
}));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/runtime-env', () => ({ platformAdmins: () => [] }));
vi.mock('@cs/tools', () => ({ platformRole: async () => m.role }));
vi.mock('./actions', () => ({ inviteAgenciesAction: vi.fn(), declineWaitlistEntryAction: vi.fn(), findPlacesAction: vi.fn(), assignBusinessAction: vi.fn() }));
vi.mock('@/server/viewer-tz', () => ({ viewerTimeZone: async () => 'UTC' }));
vi.mock('@/server/verticals', () => ({ verticalOptions: async () => [{ id: 'hvac_plumbing', name: 'HVAC and plumbing', services: [] }] }));
vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/platform/waitlist', useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

const { default: Waitlist } = await import('./page');

const entry = (over: Record<string, unknown> = {}) => ({
  id: 'w1', kind: 'agency', status: 'new', contactName: 'Ana Agency', email: 'ana@cool.co', orgName: 'Cool Air Marketing', website: null, location: null,
  verticalId: null, verticalOther: null, clientCountBand: '6-15', emailConfirmed: true, source: null, createdAt: '2026-10-05T12:00:00.000Z', decidedAt: null, sample: null, ...over,
});
const base = {
  entries: [entry()], nextCursor: 'NEXT', prevCursor: 'PREV', total: 41,
  counts: { agencyNew: 3, businessNew: 2, sampleRequested: 1 },
  sampleMonth: { used: 4, limit: 10 }, estimate: { discoveryCapUsd: 3, startingPointAvgUsd: 1.25, basedOn: 7 },
  agencies: [{ id: 'ag1', name: 'Acme', verticals: [], activeClients: 1 }], // list_pool_leads shares the stub
};
const show = async (sp: Record<string, string> = {}) =>
  render(<HelpProvider value={{ audience: 'operator', names: { agency: 'your agency', assistant: 'Sunny' } }}>{await Waitlist({ searchParams: Promise.resolve(sp) })}</HelpProvider>);

beforeEach(() => { m.calls = []; m.refuse = false; m.role = 'staff'; m.answer = base; });
afterEach(cleanup);

describe('platform waitlist page', () => {
  it('page renders tabs with counts and 404s for non-operators', async () => {
    await show();
    const nav = screen.getByRole('navigation', { name: 'Waitlist views' });
    expect(within(nav).getByRole('link', { name: /Agencies\s*\(3\)/ }).getAttribute('href')).toBe('/platform/waitlist');
    expect(within(nav).getByRole('link', { name: /Businesses\s*\(2\)/ }).getAttribute('href')).toBe('/platform/waitlist?tab=businesses');
    expect(within(nav).getByRole('link', { name: /Sample requests\s*\(1\)/ }).getAttribute('href')).toBe('/platform/waitlist?tab=samples');
    expect(within(nav).getByRole('link', { name: /Agencies/ }).getAttribute('aria-current')).toBe('page');
    expect(m.calls.find(([n]) => n === 'list_waitlist')![1]).toEqual({ kind: 'agency' });
    cleanup();
    m.refuse = true;
    await expect(show()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('asks for the tab, search and cursor, and links Previous/Next within them', async () => {
    await show({ tab: 'businesses', q: 'cool', cursor: 'CUR' });
    expect(m.calls.find(([n]) => n === 'list_waitlist')![1]).toEqual({ kind: 'business', q: 'cool', cursor: 'CUR' });
    expect(screen.getByRole('link', { name: /Next/ }).getAttribute('href')).toBe('/platform/waitlist?tab=businesses&q=cool&cursor=NEXT');
    expect(screen.getByRole('link', { name: /Previous/ }).getAttribute('href')).toBe('/platform/waitlist?tab=businesses&q=cool&cursor=PREV');
    cleanup();
    m.calls = [];
    await show({ tab: 'samples' });
    expect(m.calls.find(([n]) => n === 'list_waitlist')![1]).toEqual({ sample: true });
  });

  it('agencies table: checkbox column, org and contact, unconfirmed tag, client band, status chip, date', async () => {
    m.answer = { ...base, entries: [entry(), entry({ id: 'w2', orgName: 'Quiet Co', email: 'q@quiet.co', emailConfirmed: false, status: 'invited' })] };
    await show();
    const rows = screen.getAllByRole('row');
    const first = rows[1]!;
    expect(within(first).getByRole('checkbox', { name: 'Select Cool Air Marketing' })).toBeTruthy();
    expect(first.textContent).toContain('Ana Agency');
    expect(first.textContent).toContain('ana@cool.co');
    expect(first.textContent).toContain('6-15 clients');
    expect(first.textContent).toContain('New');
    expect(first.textContent).toContain('Oct 5');
    expect(first.textContent).not.toContain('Not confirmed');
    expect(rows[2]!.textContent).toContain('Not confirmed');
    expect(rows[2]!.textContent).toContain('Invited');
  });

  it('businesses table has no checkbox column', async () => {
    m.answer = { ...base, entries: [entry({ kind: 'business', orgName: 'Smith Plumbing', verticalId: 'hvac_plumbing', verticalOther: null, location: 'Austin, TX', clientCountBand: null })] };
    await show({ tab: 'businesses' });
    expect(screen.queryByRole('checkbox')).toBeNull();
    const row = screen.getByText('Smith Plumbing').closest('tr')!;
    expect(row.textContent).toContain('HVAC and plumbing');
    expect(row.textContent).toContain('Austin, TX');
    expect(within(row).getByRole('button', { name: 'Assign' })).toBeTruthy();
    expect(m.calls.some(([n]) => n === 'list_pool_leads')).toBe(true);
  });

  it('agencies tab and viewers do not load the assign agency list', async () => {
    await show();
    expect(m.calls.some(([n]) => n === 'list_pool_leads')).toBe(false);
    cleanup();
    m.calls = [];
    m.role = 'viewer';
    m.answer = { ...base, entries: [entry({ kind: 'business' })] };
    await show({ tab: 'businesses' });
    expect(m.calls.some(([n]) => n === 'list_pool_leads')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Assign' })).toBeNull();
  });

  it('sample tab: usage and cost line, sample business, stage', async () => {
    m.answer = {
      ...base,
      entries: [entry({ sample: { businessName: 'Smith Dental', location: 'Austin, TX', website: 'smith.co', status: 'approved', clientId: 'c1', stage: 'review', sentAt: null } })],
    };
    await show({ tab: 'samples' });
    expect(screen.getByText('This month: 4 of 10 sample briefs')).toBeTruthy();
    expect(screen.getByText(/Estimated cost per sample: discovery up to \$3\.00 \+ starting point about \$1\.25 \(average of the last 7\)/)).toBeTruthy();
    const row = screen.getByText('Cool Air Marketing').closest('tr')!;
    expect(row.textContent).toContain('Smith Dental');
    expect(row.textContent).toContain('Austin, TX');
    expect(row.textContent).toContain('In progress');
    expect(row.textContent).toContain('Brief ready to review');
  });

  it('sample tab without history says so', async () => {
    m.answer = { ...base, estimate: { discoveryCapUsd: 3, startingPointAvgUsd: null, basedOn: 0 } };
    await show({ tab: 'samples' });
    expect(screen.getByText(/starting point: no history yet/i)).toBeTruthy();
  });

  it('empty states per tab, and for a search with no match', async () => {
    m.answer = { ...base, entries: [], nextCursor: null, prevCursor: null, total: 0 };
    await show();
    expect(screen.getByText('No agencies yet')).toBeTruthy();
    cleanup();
    await show({ tab: 'businesses' });
    expect(screen.getByText('No businesses yet')).toBeTruthy();
    cleanup();
    await show({ tab: 'samples' });
    expect(screen.getByText('No sample requests yet')).toBeTruthy();
    cleanup();
    await show({ q: 'zzz' });
    expect(screen.getByText('No matches')).toBeTruthy();
  });

  it('an empty later page of a non-empty list links to the first page', async () => {
    m.answer = { ...base, entries: [], nextCursor: null, total: 2 };
    await show({ cursor: 'CUR' });
    expect(screen.getByText(/Nothing on this page\./)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to the first page' }).getAttribute('href')).toBe('/platform/waitlist');
  });
});
