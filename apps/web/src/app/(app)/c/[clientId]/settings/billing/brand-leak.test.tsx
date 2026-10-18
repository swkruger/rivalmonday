// @vitest-environment jsdom
import { renderEmail, resolveBranding } from '@cs/email';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientBillingBanner } from '@/components/shell/client-billing-banner';

const m = vi.hoisted(() => ({ ctx: { role: 'client_owner' } as { role: string }, data: null as unknown, refuse: false }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: { kind: 'user' }, ctx: m.ctx }) }));
vi.mock('@/server/tools', () => ({
  callTool: async () => {
    if (m.refuse) throw new Error('NEXT_NOT_FOUND');
    return m.data;
  },
}));
vi.mock('./actions', () => ({ managePaymentAction: Object.assign(async () => ({ ok: true }), { bind: () => async () => ({ ok: true }) }) }));
vi.mock('@/server/client-settings-nav', () => ({ hasClientSettings: async () => true }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, useRouter: () => ({ refresh: () => {} }) }));

import ClientBillingPage, { metadata } from './page';

afterEach(() => { cleanup(); m.refuse = false; m.ctx = { role: 'client_owner' }; });

const C = '00000000-0000-4000-8000-0000000000a1';
const NAME = 'Cool Agency';
const base = { agencyName: NAME, state: 'active', paused: false, enabled: true, nextChargeDate: '2026-12-01T00:00:00.000Z', nextChargeAmountCents: 12900, endsOn: null, canManagePayment: true };
const LEAK = /rival\s*monday/i;

/**
 * Phase 9b Review focus 4 / R18: everything a client user can see or receive about billing is agency-branded. This is the
 * one place that renders every client-facing billing surface and greps it: the page in each state, its browser-tab title,
 * both banners for both client roles, and both client emails (with and without agency branding).
 */
describe('client billing brand-leak guard', () => {
  it('the page (every state), its metadata title and both banners never say Rival Monday', async () => {
    const out: string[] = [];
    const states = [{}, { state: 'payment_needed' }, { state: 'invited', canManagePayment: false }, { paused: true }, { enabled: false, state: 'off' }, { state: 'cancelled' }, { state: 'disconnected' }, { endsOn: base.nextChargeDate, nextChargeDate: null }];
    for (const over of states) {
      m.data = { ...base, ...over };
      const { container, unmount } = render(await ClientBillingPage({ params: Promise.resolve({ clientId: C }), searchParams: Promise.resolve({ checkout: 'done' }) }));
      out.push(container.innerHTML);
      unmount();
      out.push(JSON.stringify(metadata));
    }
    for (const role of ['client_owner', 'client_viewer']) {
      for (const [paused, paymentNeeded] of [[true, false], [false, true], [true, true]] as const) {
        const { container, unmount } = render(<ClientBillingBanner role={role} clientId={C} agencyName={NAME} paused={paused} paymentNeeded={paymentNeeded} />);
        out.push(container.innerHTML);
        unmount();
      }
    }
    expect(out.join('\n')).not.toMatch(LEAK);
  });

  it('the tab title is the menu label; the (app) title template appends the agency name (R18, 15a §2.7)', () => {
    expect(metadata).toEqual({ title: 'Billing' });
  });

  it.each([
    ['client-payment-link', 'https://checkout.example.test/c/1'],
    ['client-payment-needed', 'https://app.example.test/c/1/settings/billing'],
  ] as const)('the %s email never says Rival Monday, with agency branding or the fallback', async (kind, actionUrl) => {
    for (const branding of [resolveBranding(NAME, { displayName: 'Cool Comfort', primary: '#112233' }), resolveBranding(NAME, null)]) {
      const out = await renderEmail({ template: 'client_billing_notice', props: { branding, kind, agencyName: NAME, actionUrl } });
      for (const s of [out.subject, out.html, out.text]) expect(s).not.toMatch(LEAK);
    }
  });
});
