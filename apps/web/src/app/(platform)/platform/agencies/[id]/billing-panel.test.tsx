// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const noop = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
vi.mock('./billing-actions', () => ({
  grantPilotAction: noop, endPilotAction: noop, extendTrialAction: noop, attachDiscountAction: noop, setSeatCapExemptAction: noop,
}));
const { BillingPanel } = await import('./billing-panel');

const AG = '22222222-2222-4222-8222-222222222222';
const billing = (over: Record<string, unknown> = {}) => ({
  agencyId: AG, state: 'trialing', plan: { name: 'Standard', version: 2 }, trialEndsAt: '2026-11-13T00:00:00Z', pilotEndsAt: null, pastDueSince: null,
  cancelAt: null, stateChangedAt: '2026-10-13T00:00:00Z', seatsSynced: 4, seatSyncPending: true, seatCapExempt: true, attachedCouponId: 'coupon_1',
  stripeCustomerId: 'cus_1', stripeSubscriptionId: null,
  invoices: [{ id: 'in_1', number: 'A-0001', amountPaidCents: 29900, status: 'paid', hostedInvoiceUrl: 'https://invoice.stripe.com/i/1', created: '2026-10-13T00:00:00Z' }],
  events: [{ fromState: 'pilot', toState: 'trialing', reason: 'admin_end_pilot', actor: 'u1', createdAt: '2026-10-13T00:00:00Z' }],
  ...over,
});
const codes = [{ id: 'd1', code: 'FRIEND' }];
afterEach(cleanup);

describe('BillingPanel', () => {
  it('shows state pill, plan version, seats with the pending flag, exemption, coupon, invoices and events', () => {
    render(<BillingPanel billing={billing() as never} role="viewer" codes={codes} />);
    expect(screen.getByText('Trial')).toBeTruthy();
    expect(screen.getByText('Standard v2')).toBeTruthy();
    expect(screen.getByText(/4 synced/)).toBeTruthy();
    expect(screen.getByText(/sync pending/)).toBeTruthy();
    expect(screen.getByText('Exempt')).toBeTruthy();
    expect(screen.getByText('coupon_1')).toBeTruthy();
    const inv = screen.getByRole('link', { name: /A-0001/ });
    expect(inv.getAttribute('href')).toBe('https://invoice.stripe.com/i/1');
    expect(inv.getAttribute('target')).toBe('_blank');
    expect(screen.getByText(/admin_end_pilot/)).toBeTruthy();
  });

  it('viewer sees no action controls', () => {
    render(<BillingPanel billing={billing() as never} role="viewer" codes={codes} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('staff gets pilot, trial and discount actions but not the seat-cap toggle', () => {
    render(<BillingPanel billing={billing() as never} role="staff" codes={codes} />);
    expect(screen.getByRole('button', { name: 'Extend trial' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Attach discount' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Grant pilot' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /pilot client cap/i })).toBeNull();
  });

  it('owner also gets the seat-cap exemption toggle', () => {
    render(<BillingPanel billing={billing() as never} role="owner" codes={codes} />);
    expect(screen.getByRole('button', { name: 'Restore pilot client cap' })).toBeTruthy();
    cleanup();
    render(<BillingPanel billing={billing({ seatCapExempt: false }) as never} role="owner" codes={codes} />);
    expect(screen.getByRole('button', { name: 'Lift pilot client cap' })).toBeTruthy();
  });

  it('End pilot only appears while the agency is in pilot', () => {
    render(<BillingPanel billing={billing({ state: 'pilot' }) as never} role="staff" codes={codes} />);
    expect(screen.getByRole('button', { name: 'End pilot' })).toBeTruthy();
    cleanup();
    render(<BillingPanel billing={billing() as never} role="staff" codes={codes} />);
    expect(screen.queryByRole('button', { name: 'End pilot' })).toBeNull();
  });
});
