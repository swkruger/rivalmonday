// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const noop = vi.hoisted(() => vi.fn(async (..._a: unknown[]) => ({ ok: true })));
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
  events: [{ fromState: 'pilot', toState: 'trialing', reason: 'admin:end_pilot', actor: 'u1', createdAt: '2026-10-13T00:00:00Z' }],
  ...over,
});
const codes = [{ id: 'd1', code: 'FRIEND' }];
afterEach(cleanup);

describe('BillingPanel', () => {
  it('shows state pill, plan version, seats with the pending flag, exemption, coupon, invoices and events', () => {
    render(<BillingPanel billing={billing() as never} role="viewer" codes={codes} tz="UTC" />);
    expect(screen.getAllByText('Free trial').length).toBeGreaterThan(0);
    expect(screen.getByText('Standard v2')).toBeTruthy();
    expect(screen.getByText(/4 synced/)).toBeTruthy();
    expect(screen.getByText(/sync pending/)).toBeTruthy();
    expect(screen.getByText('Exempt')).toBeTruthy();
    expect(screen.getByText('coupon_1')).toBeTruthy();
    const inv = screen.getByRole('link', { name: /A-0001/ });
    expect(inv.getAttribute('href')).toBe('https://invoice.stripe.com/i/1');
    expect(inv.getAttribute('target')).toBe('_blank');
    expect(screen.getByText(/Pilot ended by staff/)).toBeTruthy();
  });

  it('viewer sees no action controls', () => {
    render(<BillingPanel billing={billing() as never} role="viewer" codes={codes} tz="UTC" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('staff gets pilot, trial and discount actions but not the seat-cap toggle', () => {
    render(<BillingPanel billing={billing() as never} role="staff" codes={codes} tz="UTC" />);
    expect(screen.getByRole('button', { name: 'Extend trial' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Attach discount' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Grant pilot' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /pilot client cap/i })).toBeNull();
  });

  it('owner also gets the seat-cap exemption toggle', () => {
    render(<BillingPanel billing={billing() as never} role="owner" codes={codes} tz="UTC" />);
    expect(screen.getByRole('button', { name: 'Restore pilot client cap' })).toBeTruthy();
    cleanup();
    render(<BillingPanel billing={billing({ seatCapExempt: false }) as never} role="owner" codes={codes} tz="UTC" />);
    expect(screen.getByRole('button', { name: 'Lift pilot client cap' })).toBeTruthy();
  });

  it('End pilot only appears while the agency is in pilot', () => {
    render(<BillingPanel billing={billing({ state: 'pilot' }) as never} role="staff" codes={codes} tz="UTC" />);
    expect(screen.getByRole('button', { name: 'End pilot' })).toBeTruthy();
    cleanup();
    render(<BillingPanel billing={billing() as never} role="staff" codes={codes} tz="UTC" />);
    expect(screen.queryByRole('button', { name: 'End pilot' })).toBeNull();
  });
});

describe('BillingPanel labels, dates and confirms', () => {
  it('agency detail billing events show labels not raw enums', () => {
    render(<BillingPanel billing={billing({ events: [{ fromState: 'past_due', toState: 'read_only', reason: 'timer:past_due_7d', actor: 'system', createdAt: '2025-10-13T12:00:00Z' }, { fromState: null, toState: 'pilot', reason: 'admin:grant_pilot', actor: 'u1', createdAt: '2026-10-13T12:00:00Z' }] }) as never} role="viewer" codes={codes} tz="America/Chicago" />);
    const text = document.body.textContent ?? '';
    expect(text).toContain('Payment overdue');
    expect(text).toContain('Read-only');
    expect(text).toContain('Payment overdue for 7 days');
    expect(text).toContain('Pilot granted by staff');
    expect(text).toContain('Oct 13, 2025');
    expect(text).not.toMatch(/past_due|read_only|timer:|admin:|2025-10-13/);
  });

  it('trial and pilot end dates are date-only (UTC) whatever the viewer zone; event times use the viewer zone', () => {
    render(<BillingPanel billing={billing({ pilotEndsAt: '2026-12-01T00:00:00Z', events: [{ fromState: null, toState: 'pilot', reason: 'admin:grant_pilot', actor: 'u1', createdAt: '2026-10-13T02:00:00Z' }] }) as never} role="viewer" codes={codes} tz="America/Chicago" />);
    const dd = (label: string) => screen.getByText(label).nextElementSibling?.textContent ?? '';
    expect(dd('Trial ends')).toMatch(/^Nov 13/);
    expect(dd('Pilot ends')).toMatch(/^Dec 1$/);
    // 02:00 UTC on Oct 13 is still Oct 12 in Chicago.
    expect(document.body.textContent).toMatch(/Oct 12/);
  });

  it('invoice shows a status chip and a short date, not the raw status or an ISO date', () => {
    render(<BillingPanel billing={billing() as never} role="viewer" codes={codes} tz="UTC" />);
    expect(screen.getByText('Paid')).toBeTruthy();
    expect(screen.getAllByText(/Oct 13/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/2026-10-13/);
  });

  it('pilot action requires confirm', async () => {
    noop.mockClear();
    render(<BillingPanel billing={billing({ state: 'pilot' }) as never} role="staff" codes={codes} tz="UTC" />);
    fireEvent.click(screen.getByRole('button', { name: 'End pilot' }));
    expect(noop).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'End pilot' }));
    await waitFor(() => expect(noop).toHaveBeenCalledTimes(1));
  });

  it('seat cap and discount actions require confirm too', async () => {
    noop.mockClear();
    render(<BillingPanel billing={billing() as never} role="owner" codes={codes} tz="UTC" />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore pilot client cap' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Restore cap' }));
    await waitFor(() => expect(noop).toHaveBeenCalledTimes(1));
    cleanup();
    noop.mockClear();
    render(<BillingPanel billing={billing() as never} role="staff" codes={codes} tz="UTC" />);
    fireEvent.click(screen.getByRole('button', { name: 'Attach discount' }));
    expect(noop).not.toHaveBeenCalled();
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });
});
