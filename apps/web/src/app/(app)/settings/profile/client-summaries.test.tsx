// @vitest-environment jsdom
import { createAccessContext } from '@cs/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const A = '11111111-1111-4111-8111-111111111111';
const C = '00000000-0000-4000-8000-0000000000a1';
const m = vi.hoisted(() => ({ refuse: new Set<string>(), calls: [] as string[] }));
const BILLING = { agencyName: 'Cool Agency', state: 'active', paused: false, enabled: true, nextChargeDate: '2026-12-01T00:00:00.000Z', nextChargeAmountCents: 12900, endsOn: null, canManagePayment: true };
const DATA: Record<string, unknown> = {
  get_client_profile: { name: 'Lone Star HVAC', services: ['a', 'b', 'c'] },
  get_my_usage: { credits: { used: 40, limit: 100, ratio: 0.4, level: 'ok' } },
  get_my_billing: BILLING,
};
vi.mock('@/server/tools', () => ({
  tryCallTool: async (_c: unknown, name: string) => {
    m.calls.push(name);
    return m.refuse.has(name) ? null : DATA[name];
  },
}));

const { ClientSummaries } = await import('./client-summaries');

const ctxOf = (role: string, features: string[] = ['dashboard']) =>
  createAccessContext({ agencyId: A, userId: 'u', role: role as never, clientScope: [C], features: features as never });
const show = async (role: string, o: { billingEnabled?: boolean; features?: string[] } = {}) =>
  render(await ClientSummaries({ ctx: ctxOf(role, o.features), clientId: C, billingEnabled: o.billingEnabled ?? true }));
const links = () => screen.queryAllByRole('link').map((a) => a.getAttribute('href'));

beforeEach(() => { m.refuse.clear(); m.calls = []; DATA.get_my_billing = BILLING; });
afterEach(cleanup);

describe('ClientSummaries', () => {
  it('owner sees Business, Usage and Billing with links to the full pages', async () => {
    await show('client_owner');
    expect(screen.getByRole('heading', { name: 'Your business' })).toBeTruthy();
    expect(links()).toEqual([`/c/${C}/settings/profile`, `/c/${C}/settings/usage`, `/c/${C}/settings/billing`]);
    expect(document.body.textContent).toContain('Lone Star HVAC');
    expect(document.body.textContent).toContain('3 services');
    expect(document.body.textContent).toContain('Active');
    expect(document.body.textContent).toContain('$129 on Dec 1');
  });

  it('the next charge date is the UTC date, as on the Billing page', async () => {
    DATA.get_my_billing = { ...BILLING, nextChargeDate: '2026-12-01T02:00:00.000Z' };
    await show('client_owner');
    expect(document.body.textContent).toContain('$129 on Dec 1');
    expect(document.body.textContent).not.toContain('Nov 30');
  });

  it('viewer sees only the Business panel', async () => {
    await show('client_viewer');
    expect(links()).toEqual([`/c/${C}/settings/profile`]);
    expect(m.calls).toEqual(['get_client_profile']);
  });

  it('owner with billing off has no Billing panel and no billing read', async () => {
    await show('client_owner', { billingEnabled: false });
    expect(links()).toEqual([`/c/${C}/settings/profile`, `/c/${C}/settings/usage`]);
    expect(m.calls).not.toContain('get_my_billing');
  });

  it('a briefs_only client (no dashboard) has no Business panel', async () => {
    await show('client_owner', { features: [] });
    expect(links()).toEqual([`/c/${C}/settings/usage`, `/c/${C}/settings/billing`]);
    expect(m.calls).not.toContain('get_client_profile');
  });

  it('a refused read drops its panel only', async () => {
    m.refuse.add('get_my_usage');
    await show('client_owner');
    expect(links()).toEqual([`/c/${C}/settings/profile`, `/c/${C}/settings/billing`]);
  });

  it('renders no section when every read refuses', async () => {
    for (const n of Object.keys(DATA)) m.refuse.add(n);
    const { container } = await show('client_owner');
    expect(container.innerHTML).toBe('');
  });

  it.each(['agency_admin', 'account_manager'])('renders nothing for %s', async (role) => {
    const { container } = await show(role);
    expect(container.innerHTML).toBe('');
    expect(m.calls).toEqual([]);
  });

  it('shows the agency-named detail instead of a charge when paused; no dollars in Usage, no Rival Monday', async () => {
    DATA.get_my_billing = { ...BILLING, paused: true };
    await show('client_owner');
    expect(document.body.textContent).toContain('Monitoring is paused. Please contact Cool Agency.');
    expect(screen.getByRole('heading', { name: 'Usage' }).parentElement!.textContent).not.toMatch(/\$|dollar/i);
    expect(document.body.textContent).not.toContain('Rival Monday');
  });
});
