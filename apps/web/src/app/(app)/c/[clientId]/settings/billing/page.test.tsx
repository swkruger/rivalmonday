// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadOnlyProvider } from '@/components/read-only';
import { ClientBillingBanner } from '@/components/shell/client-billing-banner';

const m = vi.hoisted(() => ({ ctx: { role: 'client_owner' } as { role: string }, data: null as unknown, refuse: false, calls: [] as unknown[][] }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: { kind: 'user' }, ctx: m.ctx }) }));
vi.mock('@/server/tools', () => ({
  callTool: async (...a: unknown[]) => {
    m.calls.push(a);
    if (m.refuse) throw new Error('NEXT_NOT_FOUND');
    return m.data;
  },
}));
vi.mock('./actions', () => ({ managePaymentAction: Object.assign(async () => ({ ok: true }), { bind: () => async () => ({ ok: true }) }) }));
vi.mock('@/server/client-settings-nav', () => ({ hasClientSettings: async () => true }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('@/components/billing/refresh-until-changed', () => ({ RefreshUntilChanged: ({ watch }: { watch: string }) => <span data-testid="refresh" hidden>{watch}</span> }));

import ClientBillingPage from './page';

afterEach(() => { cleanup(); m.refuse = false; m.calls = []; m.ctx = { role: 'client_owner' }; });
const C = '00000000-0000-4000-8000-0000000000a1';
const base = { agencyName: 'Cool Agency', state: 'active', paused: false, enabled: true, nextChargeDate: '2026-12-01T00:00:00.000Z', nextChargeAmountCents: 12900, endsOn: null, canManagePayment: true };
const open = (query: { checkout?: string } = {}) => ClientBillingPage({ params: Promise.resolve({ clientId: C }), searchParams: Promise.resolve(query) });
const text = () => document.body.textContent ?? '';

describe('client billing page (9b)', () => {
  it('owner sees status, next charge date and amount, and Manage payment', async () => {
    m.data = base;
    render(await open());
    expect(text()).toContain('Cool Agency');
    expect(text()).toContain('Active');
    expect(text()).toContain('$129.00 on December 1, 2026');
    expect(screen.getByRole('button', { name: 'Manage payment' })).toBeTruthy();
    expect(m.calls[0]).toEqual([m.ctx, 'get_my_billing', { clientId: C }]);
  });

  it.each(['client_viewer', 'agency_admin', 'account_manager'])('%s gets a 404 before any tool call', async (role) => {
    m.ctx = { role };
    m.data = base;
    await expect(open()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(m.calls).toEqual([]);
  });

  it('a tool refusal (guest, another client) is a 404', async () => {
    m.refuse = true;
    await expect(open()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('Manage payment is hidden in a read-only support session', async () => {
    m.data = base;
    render(<ReadOnlyProvider readOnly>{await open()}</ReadOnlyProvider>);
    expect(screen.queryByRole('button', { name: 'Manage payment' })).toBeNull();
  });

  it('empty states: invited, payment needed, paused, not set up, cancelling', async () => {
    const cases: [object, string][] = [
      [{ state: 'invited', nextChargeDate: null, nextChargeAmountCents: null, canManagePayment: false }, 'Check your email for the payment link from Cool Agency.'],
      [{ state: 'payment_needed' }, 'Your last payment did not go through. Please update your payment method.'],
      [{ paused: true }, 'Monitoring is paused. Please contact Cool Agency.'],
      [{ enabled: false, state: 'off', nextChargeDate: null, nextChargeAmountCents: null, canManagePayment: false }, 'Billing is not set up for this workspace.'],
      [{ nextChargeDate: null, nextChargeAmountCents: null, endsOn: '2026-12-01T00:00:00.000Z' }, 'Your plan ends on December 1, 2026.'],
    ];
    for (const [over, copy] of cases) {
      m.data = { ...base, ...over };
      const { unmount } = render(await open());
      expect(text()).toContain(copy);
      unmount();
    }
    m.data = { ...base, state: 'invited', nextChargeDate: null, nextChargeAmountCents: null, canManagePayment: false };
    render(await open());
    expect(screen.queryByRole('button', { name: 'Manage payment' })).toBeNull();
  });

  it('shows a neutral message after Checkout returns', async () => {
    m.data = base;
    render(await open({ checkout: 'done' }));
    expect(screen.getByRole('status').textContent).toBe('Thanks — your payment details are saved.');
    cleanup();
    render(await open({ checkout: 'cancelled' }));
    expect(screen.getByRole('status').textContent).toBe('Payment setup was cancelled.');
    cleanup();
    render(await open({ checkout: 'whatever' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('refreshes after Checkout returns until the billing state changes; not otherwise', async () => {
    m.data = { ...base, state: 'invited' };
    render(await open({ checkout: 'done' }));
    expect(screen.getByTestId('refresh').textContent).toBe('invited');
    cleanup();
    render(await open({ checkout: 'cancelled' }));
    expect(screen.queryByTestId('refresh')).toBeNull();
  });

  it('page and banners never say Rival Monday, in any state', async () => {
    const out: string[] = [];
    for (const over of [{}, { state: 'payment_needed' }, { state: 'invited', canManagePayment: false }, { paused: true }, { enabled: false, state: 'off' }, { state: 'cancelled' }, { endsOn: base.nextChargeDate, nextChargeDate: null }]) {
      m.data = { ...base, ...over };
      const { container, unmount } = render(await open({ checkout: 'done' }));
      out.push(container.textContent ?? '');
      unmount();
    }
    for (const role of ['client_owner', 'client_viewer']) {
      for (const [paused, paymentNeeded] of [[true, false], [false, true]] as const) {
        const { container, unmount } = render(<ClientBillingBanner role={role} clientId={C} agencyName="Cool Agency" paused={paused} paymentNeeded={paymentNeeded} />);
        out.push(container.innerHTML);
        unmount();
      }
    }
    expect(out.join('\n')).not.toMatch(/rival\s*monday/i);
    expect(out.join('\n')).not.toMatch(/stripe/i);
  });
});
