// @vitest-environment jsdom
import { createAccessContext, ToolError } from '@cs/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const A = '11111111-1111-4111-8111-111111111111';
const C = '22222222-2222-4222-8222-222222222222';
const profile = { name: 'Target Plumbing', status: 'active', verticalId: 'hvac_plumbing', services: [], keywords: [], placeId: null, serviceArea: null, features: ['dashboard', 'ask'] };
const state = { ctx: createAccessContext({ agencyId: A, userId: 'op', role: 'agency_admin', clientScope: 'all', features: ['dashboard', 'ask'] as never, support: { sessionId: C, platformUserId: 'op' } }) };

const callTool = vi.fn(async (ctx: { support?: unknown }, name: string) => {
  if (name === 'get_ask_starters') {
    if (ctx.support) throw new ToolError('not_found', 'Unknown tool');
    return { questions: [], reviewAllowed: false };
  }
  if (name === 'list_client_billing_status') return { clients: [{ clientId: C, state: 'active', enabled: true, pill: { key: 'paying', label: 'Paying' }, nextPriceCents: 29900 }] };
  return profile;
});
vi.mock('@/server/tools', () => ({ callTool }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: state.ctx }) }));
vi.mock('@/server/verticals', () => ({ verticalOptions: async () => [{ id: 'hvac_plumbing', name: 'HVAC', services: [] }] }));
vi.mock('@/server/client-settings-nav', () => ({ hasClientSettings: async () => true }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('@/components/client-profile-form', () => ({ ClientProfileForm: () => <div>profile form</div> }));
vi.mock('./client-features-form', () => ({ ClientFeaturesForm: (p: { role?: string }) => <div>features form role={String(p.role)}</div> }));
vi.mock('@/components/billing/client-billing-controls', () => ({ ClientBillingControls: (p: { role: string; pill: { label: string } }) => <div>billing {p.pill.label} role={p.role}</div> }));
vi.mock('./actions', () => ({ saveFeaturesAction: vi.fn(), updateProfileAction: vi.fn() }));
const { default: Page } = await import('./page');

describe('client profile page', () => {
  it('shows the billing pill and controls to an account manager with the AM role', async () => {
    state.ctx = createAccessContext({ agencyId: A, userId: 'u', role: 'account_manager', clientScope: 'all', features: ['dashboard'] as never });
    render(await Page({ params: Promise.resolve({ clientId: C }) }));
    expect(screen.getByText('billing Paying role=account_manager')).toBeTruthy();
  });
  it('renders in a support session without calling the support-hidden get_ask_starters, and omits the review toggle', async () => {
    callTool.mockClear();
    render(await Page({ params: Promise.resolve({ clientId: C }) }));
    expect(screen.getByRole('heading', { level: 1, name: 'Business profile' })).toBeTruthy();
    expect(callTool.mock.calls.map((c) => c[1])).not.toContain('get_ask_starters');
    expect(screen.getByText('features form role=undefined')).toBeTruthy();
  });
  it('still loads the stored review setting for a normal agency admin', async () => {
    callTool.mockClear();
    state.ctx = createAccessContext({ agencyId: A, userId: 'u', role: 'agency_admin', clientScope: 'all', features: ['dashboard'] as never });
    render(await Page({ params: Promise.resolve({ clientId: C }) }));
    expect(callTool.mock.calls.map((c) => c[1])).toContain('get_ask_starters');
    expect(screen.getByText('features form role=agency_admin')).toBeTruthy();
  });
});
