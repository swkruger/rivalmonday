// @vitest-environment jsdom
import { createAccessContext } from '@cs/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const A = '11111111-1111-4111-8111-111111111111';
const C = '22222222-2222-4222-8222-222222222222';
const row = { clientId: C, name: 'Target Plumbing', verticalId: 'dental', pressure: { score: 1, level: 'low', reasons: [] }, topCompetitor: null, spend: null, alertsPending: 0, alertsDelivered7d: 0, briefToApprove: null, openRecommendations: 0, lastActivityAt: null };
const state = { role: 'agency_admin' as 'agency_admin' | 'account_manager' };

const callTool = vi.fn(async (_ctx: unknown, name: string): Promise<unknown> => {
  if (name === 'get_portfolio') return { items: [row] };
  if (name === 'get_onboarding_status') return { steps: {}, dismissed: false, completed: true };
  return { clients: [{ clientId: C, state: 'active', enabled: true, pill: { key: 'paying', label: 'Paying' } }] };
});
const tryCallTool = vi.fn(async (c: unknown, name: string): Promise<unknown> => callTool(c, name));
vi.mock('@/server/tools', () => ({ callTool, tryCallTool }));
vi.mock('@/server/verticals', () => ({ verticalOptions: async () => [{ id: 'hvac_plumbing', name: 'HVAC & plumbing', services: [] }] }));
vi.mock('../onboarding/actions', () => ({ dismissChecklistAction: async () => {} }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: createAccessContext({ agencyId: A, userId: 'u', role: state.role, clientScope: 'all', features: ['dashboard'] as never }) }) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('@/components/spend-badge', () => ({ SpendBadge: () => <span /> }));
vi.mock('@/components/billing/client-billing-controls', () => ({ ClientBillingControls: (p: { role: string; pill: { label: string } }) => <div>billing {p.pill.label} role={p.role}</div> }));
const { default: Page } = await import('./page');

afterEach(cleanup);

describe('portfolio billing column', () => {
  it.each([['agency_admin'], ['account_manager']] as const)('shows the pill and controls for %s', async (role) => {
    state.role = role;
    render(await Page());
    expect(callTool.mock.calls.map((c) => c[1])).toContain('list_client_billing_status');
    expect(screen.getAllByText(`billing Paying role=${role}`).length).toBeGreaterThan(0);
  });
  it('never reads revenue (amounts) on the portfolio', async () => {
    state.role = 'account_manager';
    callTool.mockClear();
    render(await Page());
    expect(callTool.mock.calls.map((c) => c[1])).not.toContain('get_client_revenue');
  });
});

describe('onboarding checklist on the portfolio', () => {
  const status = { steps: { profile: 'open', team: 'open', plan: 'open', branding: 'open', first_client: 'open' }, dismissed: false, completed: false };
  const withStatus = () => callTool.mockImplementation(async (_c: unknown, name: string) => {
    if (name === 'get_portfolio') return { items: [row] };
    if (name === 'get_onboarding_status') return status;
    if (name === 'get_billing_summary') return { state: 'trialing' };
    return { clients: [] };
  });
  it('shows the checklist to agency admins', async () => {
    state.role = 'agency_admin';
    withStatus();
    render(await Page());
    expect(screen.getByText('Getting started')).toBeTruthy();
    expect(screen.getByText('Add a payment method')).toBeTruthy();
  });
  it('shows nothing and reads nothing extra for account managers', async () => {
    state.role = 'account_manager';
    withStatus();
    callTool.mockClear();
    render(await Page());
    expect(screen.queryByText('Getting started')).toBeNull();
    const names = callTool.mock.calls.map((c) => c[1]);
    expect(names).not.toContain('get_onboarding_status');
    expect(names).not.toContain('get_billing_summary');
  });
  it('a completed legacy agency (no onboarding row, R25) gets no checklist and no billing read', async () => {
    state.role = 'agency_admin';
    withStatus();
    callTool.mockImplementation(async (_c: unknown, name: string) => {
      if (name === 'get_portfolio') return { items: [row] };
      if (name === 'get_onboarding_status') return { ...status, steps: { profile: 'done', team: 'done', plan: 'done', branding: 'done', first_client: 'done' }, completed: true, redirected: true, source: 'legacy' };
      return { clients: [] };
    });
    callTool.mockClear();
    tryCallTool.mockClear();
    render(await Page());
    expect(screen.queryByText('Getting started')).toBeNull();
    const names = [...callTool.mock.calls, ...tryCallTool.mock.calls].map((c) => c[1]);
    expect(names).not.toContain('get_billing_summary');
  });
  it.each([
    ['throws', async () => { throw new Error('boom'); }],
    ['is refused (null)', async () => null],
  ])('the billing read fails soft when it %s: checklist renders without the payment sub-line', async (_n, impl) => {
    state.role = 'agency_admin';
    withStatus();
    tryCallTool.mockImplementationOnce(impl as never);
    callTool.mockImplementation(async (_c: unknown, name: string) => {
      if (name === 'get_portfolio') return { items: [row] };
      if (name === 'get_onboarding_status') return status;
      if (name === 'get_billing_summary') throw new Error('NEXT_NOT_FOUND');
      return { clients: [] };
    });
    render(await Page());
    expect(screen.getByText('Getting started')).toBeTruthy();
    expect(screen.queryByText('Add a payment method')).toBeNull();
  });
});
