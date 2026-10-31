// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ role: 'owner' as string | null, callTool: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireOperatorContext: async () => ({ viewer: { kind: 'user' }, ctx: { userId: 'op' } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => m.callTool(...a), registry: () => ({ invoke: async () => ({}) }) }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/viewer-tz', () => ({ viewerTimeZone: async () => 'UTC' }));
vi.mock('@/server/runtime-env', () => ({ platformAdmins: () => [] }));
vi.mock('@cs/tools', () => ({ platformRole: async () => m.role }));
vi.mock('./plan-editor', () => ({ PlanEditor: ({ canEdit }: { canEdit: boolean }) => <div>plan-editor {String(canEdit)}</div> }));
vi.mock('./plan-agencies', () => ({ PlanAgencies: ({ canMove, data }: { canMove: boolean; data: { agencies: unknown[] } }) => <div>plan-agencies {String(canMove)} {data.agencies.length}</div> }));
vi.mock('./codes', () => ({ Codes: ({ canManage }: { canManage: boolean }) => <div>codes {String(canManage)}</div> }));
vi.mock('./connect-panel', () => ({ ConnectPanel: ({ canEdit }: { canEdit: boolean }) => <div>connect-panel {String(canEdit)}</div> }));
vi.mock('./signups-panel', () => ({ parseDays: (v: unknown) => (v === '90' ? 90 : 30), SignupsPanel: ({ paused, canEdit, days }: { paused: boolean; canEdit: boolean; days: number }) => <div>signups-panel {String(paused)} {String(canEdit)} {days}</div> }));
vi.mock('./invite-links', () => ({ InviteLinks: () => <div>invite-links</div> }));
const { default: Page } = await import('./page');
const { billingTab } = await import('./tabs');

const answers: Record<string, unknown> = {
  get_billing_overview: { mrrCents: 125000, paidSeats: 17, agenciesByState: { pilot: 2, trialing: 1, active: 3, past_due: 0, read_only: 0, suspended: 0, cancelled: 1 }, history: [] },
  list_plans: { plans: [] },
  list_plan_agencies: { currentPlanId: 'p2', currentVersion: 2, agencies: [{}, {}] },
  list_discount_codes: { codes: [] },
  list_invite_links: { links: [] },
  get_signups_paused: { paused: false },
  get_pilot_settings: { pilotMode: false, sampleBriefMonthlyLimit: 10 },
  get_signup_funnel: { open: { signups: 0, profileDone: 0, firstClient: 0, cardAdded: 0 }, invite: { signups: 0, profileDone: 0, firstClient: 0, cardAdded: 0 } },
  get_connect_overview: { globalFeePercent: 0, agencies: [], totals: { connectedAgencies: 0, payingClients: 0, clientMrrCents: 0 } },
};
beforeEach(() => {
  m.role = 'owner';
  m.callTool.mockReset().mockImplementation(async (_c: unknown, name: string) => answers[name]);
});
afterEach(cleanup);

describe('/platform/billing', () => {
  it('shows MRR, paid seats and agencies by state', async () => {
    render(await Page());
    expect(screen.getByText('$1,250')).toBeTruthy();
    expect(screen.getByText('17')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Payment overdue')).toBeTruthy();
  });

  it('owner: editable plans, manageable codes, invite links, Connect', async () => {
    render(await Page({ searchParams: Promise.resolve({ tab: 'plans' }) }));
    expect(screen.getByText('plan-editor true')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Agencies not on the current version' })).toBeTruthy();
    expect(screen.getByText('plan-agencies true 2')).toBeTruthy();
    cleanup();
    render(await Page({ searchParams: Promise.resolve({ tab: 'codes' }) }));
    expect(screen.getByText('codes true')).toBeTruthy();
    cleanup();
    render(await Page({ searchParams: Promise.resolve({ tab: 'signups' }) }));
    expect(screen.getByText('invite-links')).toBeTruthy();
    cleanup();
    render(await Page({ searchParams: Promise.resolve({ tab: 'connect' }) }));
    expect(screen.getByText('connect-panel true')).toBeTruthy();
  });

  it('shows the sign-up panel: owner can edit; the 30/90 choice reaches the funnel tool', async () => {
    render(await Page({ searchParams: Promise.resolve({ tab: 'signups', days: '90' }) }));
    expect(screen.getByText('signups-panel false true 90')).toBeTruthy();
    expect(m.callTool).toHaveBeenCalledWith(expect.anything(), 'get_signup_funnel', { days: 90 });
  });

  it('viewer: sign-up panel is read-only', async () => {
    m.role = 'viewer';
    render(await Page({ searchParams: Promise.resolve({ tab: 'signups' }) }));
    expect(screen.getByText('signups-panel false false 30')).toBeTruthy();
  });

  it('staff: read-only plans and codes, invite links shown', async () => {
    m.role = 'staff';
    render(await Page({ searchParams: Promise.resolve({ tab: 'plans' }) }));
    expect(screen.getByText('plan-editor false')).toBeTruthy();
    expect(screen.getByText('plan-agencies false 2')).toBeTruthy();
    cleanup();
    render(await Page({ searchParams: Promise.resolve({ tab: 'codes' }) }));
    expect(screen.getByText('codes false')).toBeTruthy();
    cleanup();
    render(await Page({ searchParams: Promise.resolve({ tab: 'signups' }) }));
    expect(screen.getByText('invite-links')).toBeTruthy();
  });

  it('viewer: no invite-links section and list_invite_links is never called', async () => {
    m.role = 'viewer';
    render(await Page({ searchParams: Promise.resolve({ tab: 'signups' }) }));
    expect(screen.queryByText('invite-links')).toBeNull();
    expect(m.callTool.mock.calls.map((c) => c[1])).not.toContain('list_invite_links');
  });

  it('unknown tab falls back to overview', async () => {
    expect([billingTab(undefined), billingTab('nope'), billingTab(['plans']), billingTab('connect')]).toEqual(['overview', 'overview', 'overview', 'connect']);
    render(await Page({ searchParams: Promise.resolve({ tab: 'nope' }) }));
    expect(m.callTool.mock.calls.map((c) => c[1])).toEqual(['get_billing_overview']);
  });

  it.each([
    ['overview', ['get_billing_overview']],
    ['plans', ['list_plan_agencies', 'list_plans']],
    ['codes', ['list_discount_codes']],
    ['signups', ['get_signups_paused', 'get_pilot_settings', 'get_signup_funnel', 'list_invite_links', 'list_discount_codes']],
    ['connect', ['get_connect_overview']],
  ])('each tab renders only its section: %s', async (tab, tools) => {
    render(await Page({ searchParams: Promise.resolve({ tab }) }));
    expect(m.callTool.mock.calls.map((c) => c[1]).sort()).toEqual([...tools].sort());
  });

  it('tab links keep days', async () => {
    render(await Page({ searchParams: Promise.resolve({ tab: 'plans', days: '90' }) }));
    const nav = screen.getByRole('navigation', { name: 'Billing sections' });
    const hrefs = within(nav).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['overview', 'plans', 'codes', 'signups', 'connect'].map((t) => `/platform/billing?tab=${t}&days=90`));
    expect(within(nav).getByRole('link', { name: 'Plans' }).getAttribute('aria-current')).toBe('page');
    expect(within(nav).getByRole('link', { name: 'Sign-up & invites' })).toBeTruthy();
  });
});
