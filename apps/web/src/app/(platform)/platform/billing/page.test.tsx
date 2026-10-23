// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ role: 'owner' as string | null, callTool: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireOperatorContext: async () => ({ viewer: { kind: 'user' }, ctx: { userId: 'op' } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => m.callTool(...a) }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/runtime-env', () => ({ platformAdmins: () => [] }));
vi.mock('@cs/tools', () => ({ platformRole: async () => m.role }));
vi.mock('./plan-editor', () => ({ PlanEditor: ({ canEdit }: { canEdit: boolean }) => <div>plan-editor {String(canEdit)}</div> }));
vi.mock('./codes', () => ({ Codes: ({ canManage }: { canManage: boolean }) => <div>codes {String(canManage)}</div> }));
vi.mock('./connect-panel', () => ({ ConnectPanel: ({ canEdit }: { canEdit: boolean }) => <div>connect-panel {String(canEdit)}</div> }));
vi.mock('./signups-panel', () => ({ parseDays: (v: unknown) => (v === '90' ? 90 : 30), SignupsPanel: ({ paused, canEdit, days }: { paused: boolean; canEdit: boolean; days: number }) => <div>signups-panel {String(paused)} {String(canEdit)} {days}</div> }));
vi.mock('./invite-links', () => ({ InviteLinks: () => <div>invite-links</div> }));
const { default: Page } = await import('./page');

const answers: Record<string, unknown> = {
  get_billing_overview: { mrrCents: 125000, paidSeats: 17, agenciesByState: { pilot: 2, trialing: 1, active: 3, past_due: 0, read_only: 0, suspended: 0, cancelled: 1 } },
  list_plans: { plans: [] },
  list_discount_codes: { codes: [] },
  list_invite_links: { links: [] },
  get_signups_paused: { paused: false },
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
    expect(screen.getByText('Past due')).toBeTruthy();
  });

  it('owner: editable plans, manageable codes, invite links', async () => {
    render(await Page());
    expect(screen.getByText('plan-editor true')).toBeTruthy();
    expect(screen.getByText('codes true')).toBeTruthy();
    expect(screen.getByText('invite-links')).toBeTruthy();
    expect(screen.getByText('connect-panel true')).toBeTruthy();
  });

  it('shows the sign-up panel: owner can edit; the 30/90 choice reaches the funnel tool', async () => {
    render(await Page({ searchParams: Promise.resolve({ days: '90' }) }));
    expect(screen.getByText('signups-panel false true 90')).toBeTruthy();
    expect(m.callTool).toHaveBeenCalledWith(expect.anything(), 'get_signup_funnel', { days: 90 });
  });

  it('viewer: sign-up panel is read-only', async () => {
    m.role = 'viewer';
    render(await Page());
    expect(screen.getByText('signups-panel false false 30')).toBeTruthy();
  });

  it('staff: read-only plans and codes, invite links shown', async () => {
    m.role = 'staff';
    render(await Page());
    expect(screen.getByText('plan-editor false')).toBeTruthy();
    expect(screen.getByText('codes false')).toBeTruthy();
    expect(screen.getByText('invite-links')).toBeTruthy();
  });

  it('viewer: no invite-links section and list_invite_links is never called', async () => {
    m.role = 'viewer';
    render(await Page());
    expect(screen.queryByText('invite-links')).toBeNull();
    expect(screen.getByText('connect-panel false')).toBeTruthy();
    expect(m.callTool.mock.calls.map((c) => c[1])).not.toContain('list_invite_links');
  });
});
