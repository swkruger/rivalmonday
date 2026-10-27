// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ role: 'staff' as string | null, callTool: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireOperatorContext: async () => ({ viewer: { kind: 'user' }, ctx: { userId: 'op' } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => m.callTool(...a) }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/viewer-tz', () => ({ viewerTimeZone: async () => 'UTC' }));
vi.mock('@/server/runtime-env', () => ({ platformAdmins: () => [] }));
vi.mock('@cs/tools', () => ({ platformRole: async () => m.role, ARCHIVE_BILLING_MESSAGE: 'This agency still has active billing. Cancel it in Stripe first, then archive.' }));
vi.mock('./actions', () => ({}));
vi.mock('./manage-menu', () => ({
  ManageMenu: ({ role, held, archiveRefusal, planMove }: { role: string; held: boolean; archiveRefusal: string | null; planMove?: unknown }) => (
    <div>manage-menu {role} {held ? 'held' : 'not-held'}{role === 'owner' ? ' archive' : ''} {archiveRefusal ?? 'no-refusal'}{planMove ? ' can-move' : ''}</div>
  ),
  UnarchiveButton: () => <button type="button">Unarchive</button>,
}));
vi.mock('./people-section', () => ({ PeopleSection: ({ tab, canManage, people }: { tab: string; canManage: boolean; people: { members: unknown[] } }) => <div>people-section {tab} {canManage ? 'manage' : 'read'} {people.members.length}</div> }));
vi.mock('./hold-banner', () => ({
  HoldBanner: ({ issue, canRetry }: { issue: string; canRetry: boolean }) => <div>hold-banner {issue}{canRetry ? ' retry' : ' no-retry'}</div>,
  HoldChip: ({ reason, since, byName }: { reason: string; since: string; byName: string }) => <span>On hold ({reason} / {since} / {byName})</span>,
}));
vi.mock('../../_components/overview-charts', () => ({ cardCls: 'card', deltaPill: () => null, PlatformCharts: () => null }));
vi.mock('../../_components/range-toggle', () => ({ parseRange: () => '28d', RangeToggle: () => null }));
vi.mock('./billing-panel', () => ({ BillingPanel: ({ role, billing, behind }: { role: string; billing: { state: string }; behind?: { version: number | null; currentVersion: number } | null }) => <div>billing-panel {role} {billing.state}{behind ? ` behind ${behind.version ?? 'unset'}/${behind.currentVersion}` : ''}</div> }));
vi.mock('./client-limits', () => ({ ClientLimitsTable: ({ canEdit, data }: { canEdit: boolean; data: { items: unknown[] } }) => <div>client-limits {canEdit ? 'edit' : 'read'} {data.items.length}</div> }));
vi.mock('./support-dialog', () => ({ SupportDialog: ({ agencyId }: { agencyId: string }) => <button type="button">View as agency {agencyId}</button> }));
const { default: Page } = await import('./page');

const AG = '22222222-2222-4222-8222-222222222222';
const tile = { value: 1, previous: 1 };
const detail = {
  agency: { id: AG, name: 'Acme', createdAt: '2026-01-01T00:00:00Z', health: 'steady' },
  tiles: { agencies: tile, clientsActive: tile, seats: tile, wau: tile, spendMonthUsd: tile },
  series: [],
  hold: null as null | { since: string; reason: string; byName: string },
  archivedAt: null as string | null,
  holdBillingIssue: null as null | 'pause' | 'resume',
  archiveBlockers: { agencyPlan: false, clientSubscriptions: 0 } as { agencyPlan: boolean; clientSubscriptions: number },
  team: { agencyAdmin: 1, accountManager: 0, clientOwner: 0, clientViewer: 0 },
  clients: [],
};
const session = { id: 's1', startedAt: '2026-10-12T10:00:00Z', endedAt: '2026-10-12T10:12:00Z', platformUserName: 'Sam Staff', reason: 'Checking brief setup', durationMinutes: 12, endReason: 'exit' };

beforeEach(() => {
  m.role = 'staff';
  m.callTool.mockReset();
  m.callTool.mockImplementation(async (_ctx: unknown, name: string) => {
    if (name === 'get_platform_agency') return detail;
    if (name === 'get_agency_billing') return { state: 'trialing' };
    if (name === 'get_client_limits') return { defaultLimitUsd: 15, pausePercent: 130, items: [{}, {}] };
    if (name === 'list_plan_agencies') return { currentPlanId: 'p3', currentVersion: 3, agencies: [] };
    if (name === 'list_agency_people') return { members: [{ membershipId: 'm1' }], invitations: [] };
    if (name === 'list_discount_codes') return { codes: [{ id: 'd1', code: 'FRIEND', revokedAt: null }, { id: 'd2', code: 'OLD', revokedAt: '2026-10-01T00:00:00Z' }] };
    return { rows: [session] };
  });
});
afterEach(cleanup);
const page = (sp: Record<string, string> = {}) => Page({ params: Promise.resolve({ id: AG }), searchParams: Promise.resolve(sp) });

describe('platform agency page: support sessions', () => {
  it('offers "View as agency" to staff and lists recent sessions from list_agency_support_sessions', async () => {
    render(await page());
    expect(screen.getByRole('button', { name: `View as agency ${AG}` })).toBeTruthy();
    expect(m.callTool).toHaveBeenCalledWith({ userId: 'op' }, 'list_agency_support_sessions', { agencyId: AG });
    expect(screen.getByText('Sam Staff')).toBeTruthy();
    expect(screen.getByText('Checking brief setup')).toBeTruthy();
    expect(screen.getByText('12 min')).toBeTruthy();
    expect(screen.queryByText('Support session ended.')).toBeNull();
  });

  it('hides "View as agency" from a platform viewer', async () => {
    m.role = 'viewer';
    render(await page());
    expect(screen.queryByRole('button', { name: /View as agency/ })).toBeNull();
  });

  it('shows "Support session ended." on ?ended=1', async () => {
    render(await page({ ended: '1' }));
    expect(screen.getByRole('status').textContent).toBe('Support session ended.');
  });
});

describe('platform agency page: billing panel', () => {
  it('loads get_agency_billing and hands the role to the panel', async () => {
    render(await page());
    expect(m.callTool).toHaveBeenCalledWith({ userId: 'op' }, 'get_agency_billing', { agencyId: AG });
    expect(screen.getByText('billing-panel staff trialing')).toBeTruthy();
  });

  it('a viewer gets the panel read-only and the codes list is not fetched', async () => {
    m.role = 'viewer';
    render(await page());
    expect(screen.getByText('billing-panel viewer trialing')).toBeTruthy();
  });
});

describe('platform agency page: plan version', () => {
  const withRow = (row: Record<string, unknown>) => {
    const base = m.callTool.getMockImplementation()!;
    m.callTool.mockImplementation(async (ctx: unknown, name: string, input: unknown) => (name === 'list_plan_agencies'
      ? { currentPlanId: 'p3', currentVersion: 3, agencies: [{ agencyId: AG, state: 'active', onHold: false, version: 1, ...row }] }
      : base(ctx, name, input)));
  };
  it('on the current version the panel gets no behind info and the menu no move', async () => {
    render(await page());
    expect(screen.getByText('billing-panel staff trialing')).toBeTruthy();
    expect(screen.queryByText(/can-move/)).toBeNull();
  });
  it('behind: the panel gets its version and the current one; the menu can move it', async () => {
    withRow({});
    render(await page());
    expect(screen.getByText('billing-panel staff trialing behind 1/3')).toBeTruthy();
    expect(screen.getByText(/can-move/)).toBeTruthy();
  });
  it('a never-set plan is behind with an unset version', async () => {
    withRow({ version: null });
    render(await page());
    expect(screen.getByText('billing-panel staff trialing behind unset/3')).toBeTruthy();
  });
  it('a cancelled agency is shown behind but cannot be moved', async () => {
    withRow({ state: 'cancelled' });
    render(await page());
    expect(screen.getByText(/behind 1\/3/)).toBeTruthy();
    expect(screen.queryByText(/can-move/)).toBeNull();
  });
  it('a failed list_plan_agencies read still renders the page: panel without behind info, no move', async () => {
    const base = m.callTool.getMockImplementation()!;
    m.callTool.mockImplementation(async (ctx: unknown, name: string, input: unknown) => {
      if (name === 'list_plan_agencies') throw Object.assign(new Error('No billing plan is configured.'), { code: 'conflict' });
      return base(ctx, name, input);
    });
    m.role = 'owner';
    render(await page());
    expect(screen.getByText('billing-panel owner trialing')).toBeTruthy();
    expect(screen.getByText(/manage-menu owner/).textContent).not.toContain('can-move');
  });
  it('a held agency cannot be moved', async () => {
    withRow({});
    const withRowImpl = m.callTool.getMockImplementation()!;
    m.callTool.mockImplementation(async (ctx: unknown, name: string, input: unknown) => (name === 'get_platform_agency'
      ? { ...detail, hold: { since: '2026-10-01T00:00:00Z', reason: 'x', byName: 'Sam' } }
      : withRowImpl(ctx, name, input)));
    render(await page());
    expect(screen.queryByText(/can-move/)).toBeNull();
  });
});

describe('platform agency page: labels and dates', () => {
  it('shows the health label, short dates and client status chips instead of raw values', async () => {
    const base = m.callTool.getMockImplementation()!;
    m.callTool.mockImplementation(async (ctx: unknown, name: string, input: unknown) => {
      if (name === 'get_platform_agency') return { ...detail, agency: { ...detail.agency, health: 'at_risk', createdAt: '2025-01-01T12:00:00Z' }, clients: [{ id: 'c1', name: 'Lone Star', status: 'prospect', createdAt: '2025-03-04T10:00:00Z' }] };
      return base(ctx, name, input);
    });
    render(await page());
    expect(screen.getByText('At risk')).toBeTruthy();
    expect(screen.getByText('Prospect')).toBeTruthy();
    expect(screen.getByText('Mar 4, 2025')).toBeTruthy();
    expect(document.body.textContent).toContain('Created Jan 1, 2025.');
    expect(document.body.textContent).not.toMatch(/2025-01-01|2025-03-04|prospect/);
  });
});

describe('platform agency page: client limits', () => {
  it('loads get_client_limits and lets staff edit', async () => {
    render(await page());
    expect(m.callTool).toHaveBeenCalledWith({ userId: 'op' }, 'get_client_limits', { agencyId: AG });
    expect(screen.getByText('client-limits edit 2')).toBeTruthy();
  });
  it('a viewer gets the table read-only', async () => {
    m.role = 'viewer';
    render(await page());
    expect(screen.getByText('client-limits read 2')).toBeTruthy();
  });
});

const withDetail = (over: Record<string, unknown>) => {
  const base = m.callTool.getMockImplementation()!;
  m.callTool.mockImplementation(async (ctx: unknown, name: string, input: unknown) => (name === 'get_platform_agency' ? { ...detail, ...over } : base(ctx, name, input)));
};
const called = (name: string) => m.callTool.mock.calls.some((c) => c[1] === name);

describe('platform agency page: manage menu', () => {
  it('a viewer gets no Manage menu', async () => {
    m.role = 'viewer';
    render(await page());
    expect(screen.queryByText(/manage-menu/)).toBeNull();
  });
  it('staff get Manage without Archive; owners with Archive', async () => {
    render(await page());
    expect(screen.getByText(/manage-menu staff not-held/).textContent).not.toContain('archive');
    cleanup();
    m.role = 'owner';
    render(await page());
    expect(screen.getByText(/manage-menu owner/).textContent).toContain('archive');
  });
  it('the "coming soon" line and the team-counts tip are gone', async () => {
    render(await page());
    expect(document.body.textContent).not.toContain('Agency management is coming soon.');
    expect(document.body.textContent).not.toContain('About the team counts');
  });
  it('live billing becomes the archive refusal, worded for what is live', async () => {
    m.role = 'owner';
    const msg = 'This agency still has active billing. Cancel it in Stripe first, then archive.';
    const base = m.callTool.getMockImplementation()!;
    for (const [blockers, tail] of [
      [{ agencyPlan: true, clientSubscriptions: 2 }, 'Its plan and 2 client subscriptions are still active.'],
      [{ agencyPlan: true, clientSubscriptions: 1 }, 'Its plan and 1 client subscription are still active.'],
      [{ agencyPlan: true, clientSubscriptions: 0 }, 'Its plan is still active.'],
      [{ agencyPlan: false, clientSubscriptions: 3 }, '3 client subscriptions are still active.'],
      [{ agencyPlan: false, clientSubscriptions: 1 }, '1 client subscription is still active.'],
    ] as const) {
      m.callTool.mockImplementation(async (ctx: unknown, name: string, input: unknown) => (name === 'get_platform_agency' ? { ...detail, archiveBlockers: blockers } : base(ctx, name, input)));
      render(await page());
      expect(screen.getByText(/manage-menu owner/).textContent).toContain(`${msg} ${tail}`);
      cleanup();
    }
  });
});

describe('platform agency page: people', () => {
  it('loads list_agency_people and passes the ?people= tab; staff manage, viewers read', async () => {
    render(await page({ people: 'invites' }));
    expect(m.callTool).toHaveBeenCalledWith({ userId: 'op' }, 'list_agency_people', { agencyId: AG });
    expect(screen.getByText('people-section invites manage 1')).toBeTruthy();
    cleanup();
    m.role = 'viewer';
    render(await page({ people: 'bogus' }));
    expect(screen.getByText('people-section team read 1')).toBeTruthy();
  });
});

describe('platform agency page: hold', () => {
  it('a held agency shows the On hold chip with reason, since and by; no banner without an issue', async () => {
    withDetail({ hold: { since: '2026-10-25T09:00:00Z', reason: 'Card declined', byName: 'Alex' } });
    render(await page());
    expect(screen.getByText('On hold (Card declined / Oct 25 / Alex)')).toBeTruthy();
    expect(screen.getByText(/manage-menu staff held/)).toBeTruthy();
    expect(screen.queryByText(/hold-banner/)).toBeNull();
  });
  it('a billing issue shows the banner', async () => {
    withDetail({ hold: { since: '2026-10-25T09:00:00Z', reason: 'Card declined', byName: 'Alex' }, holdBillingIssue: 'pause' });
    render(await page());
    expect(screen.getByText('hold-banner pause retry')).toBeTruthy();
  });
  it('a viewer gets the banner without a retry control', async () => {
    m.role = 'viewer';
    withDetail({ hold: { since: '2026-10-25T09:00:00Z', reason: 'Card declined', byName: 'Alex' }, holdBillingIssue: 'pause' });
    render(await page());
    expect(screen.getByText('hold-banner pause no-retry')).toBeTruthy();
  });
});

describe('platform agency page: archived', () => {
  const archived = { archivedAt: '2026-10-20T09:00:00Z', tiles: null, series: null, agency: { ...detail.agency, health: null } };
  it('renders the archived view only: chip, date, people read-only, clients; skips the other reads', async () => {
    m.role = 'owner';
    withDetail({ ...archived, hold: { since: '2026-10-01T09:00:00Z', reason: 'x', byName: 'Alex' }, holdBillingIssue: 'pause' });
    render(await page());
    expect(screen.getByText('Archived')).toBeTruthy();
    expect(document.body.textContent).toContain('Archived Oct 20.');
    expect(screen.getByRole('button', { name: 'Unarchive' })).toBeTruthy();
    expect(screen.getByText('people-section team read 1')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Clients' })).toBeTruthy();
    for (const t of ['get_agency_billing', 'get_client_limits', 'list_agency_support_sessions', 'list_discount_codes']) expect(called(t)).toBe(false);
    expect(screen.queryByText(/manage-menu/)).toBeNull();
    expect(screen.queryByText(/On hold/)).toBeNull();
    expect(screen.queryByText(/hold-banner/)).toBeNull();
    expect(screen.queryByText('Steady')).toBeNull();
    expect(screen.queryByText(/billing-panel|client-limits/)).toBeNull();
    expect(screen.queryByRole('button', { name: /View as agency/ })).toBeNull();
  });
  it('staff see no Unarchive', async () => {
    withDetail(archived);
    render(await page());
    expect(screen.queryByRole('button', { name: 'Unarchive' })).toBeNull();
  });
});

describe('platform agency page: layout (16e)', () => {
  it('starts with the h1 agency name; the health chip sits in the header, not above it', async () => {
    m.callTool.mockImplementation(async (_ctx: unknown, name: string) => (name === 'get_platform_agency' ? detail : name === 'list_agency_people' ? { members: [], invitations: [] } : name === 'get_client_limits' ? { items: [] } : name === 'get_agency_billing' ? { state: 'trialing' } : name === 'list_plan_agencies' ? { currentVersion: 3, agencies: [] } : name === 'list_discount_codes' ? { codes: [] } : { rows: [] }));
    const { container } = render(await page({ ended: '1' }));
    const first = container.querySelector('h1, h2, h3');
    expect(first?.tagName).toBe('H1');
    expect(first?.textContent).toBe('Acme');
    expect(screen.getByRole('heading', { name: 'Support sessions' })).toBeTruthy();
  });
});
