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
vi.mock('./invite-links', () => ({ InviteLinks: () => <div>invite-links</div> }));
const { default: Page } = await import('./page');

const answers: Record<string, unknown> = {
  get_billing_overview: { mrrCents: 125000, paidSeats: 17, agenciesByState: { pilot: 2, trialing: 1, active: 3, past_due: 0, read_only: 0, suspended: 0, cancelled: 1 } },
  list_plans: { plans: [] },
  list_discount_codes: { codes: [] },
  list_invite_links: { links: [] },
};
beforeEach(() => {
  m.role = 'owner';
  m.callTool.mockReset().mockImplementation(async (_c: unknown, name: string) => answers[name]);
});
afterEach(cleanup);

describe('/platform/billing', () => {
  it('shows MRR, paid seats and agencies by state', async () => {
    render(await Page());
    expect(screen.getByText('$1,250.00')).toBeTruthy();
    expect(screen.getByText('17')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('Past due')).toBeTruthy();
  });

  it('owner: editable plans, manageable codes, invite links', async () => {
    render(await Page());
    expect(screen.getByText('plan-editor true')).toBeTruthy();
    expect(screen.getByText('codes true')).toBeTruthy();
    expect(screen.getByText('invite-links')).toBeTruthy();
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
    expect(m.callTool.mock.calls.map((c) => c[1])).not.toContain('list_invite_links');
  });
});
