// @vitest-environment jsdom
import { createAccessContext } from '@cs/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const A = '11111111-1111-4111-8111-111111111111';
const C = '22222222-2222-4222-8222-222222222222';
const row = { clientId: C, name: 'Target Plumbing', verticalId: 'dental', pressure: { score: 1, level: 'low', reasons: [] }, topCompetitor: null, spend: null, alertsPending: 0, alertsDelivered7d: 0, briefToApprove: null, openRecommendations: 0, lastActivityAt: null };
const state = { role: 'agency_admin' as 'agency_admin' | 'account_manager' };

const callTool = vi.fn(async (_ctx: unknown, name: string) => {
  if (name === 'get_portfolio') return { items: [row] };
  return { clients: [{ clientId: C, state: 'active', enabled: true, pill: { key: 'paying', label: 'Paying' } }] };
});
vi.mock('@/server/tools', () => ({ callTool }));
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
