// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ viewer: { kind: 'user' } as { kind: string }, ctx: { role: 'agency_admin' } as Record<string, unknown>, callTool: vi.fn(), runTool: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: m.viewer, ctx: m.ctx }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => m.callTool(...a) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
const { default: Page } = await import('./page');
const { checkoutAction, portalAction, redeemCodeAction } = await import('./actions');

const summary = (over: Record<string, unknown> = {}) => ({
  state: 'trialing',
  plan: { name: 'Standard', version: 1, basePriceCents: 29900, includedSeats: 3, seatPriceCents: 4900 },
  dates: { trialEndsAt: '2026-11-13T12:00:00Z', pilotEndsAt: null, pastDueSince: null, pausesOn: null, cancelAt: null },
  seats: { used: 4, included: 3, extra: 1 },
  nextInvoice: { amountDueCents: 34800, periodEnd: '2026-11-13T12:00:00Z', discountCents: 1000 },
  discount: { code: 'FRIEND', couponId: 'c1' },
  recentInvoices: [{ id: 'in_1', number: 'A-0001', amountPaidCents: 29900, status: 'paid', hostedInvoiceUrl: 'https://invoice.stripe.com/i/1', created: '2026-10-13T12:00:00Z' }],
  ...over,
});
const page = (sp: Record<string, string> = {}) => Page({ searchParams: Promise.resolve(sp) });

beforeEach(() => {
  m.viewer = { kind: 'user' };
  m.ctx = { role: 'agency_admin' };
  m.callTool.mockReset().mockResolvedValue(summary());
  m.runTool.mockReset();
});
afterEach(cleanup);

describe('/agency/settings/billing', () => {
  it('shows plan, state, key date, seats, next invoice, discount, invoices and the CSV link', async () => {
    render(await page());
    expect(m.callTool).toHaveBeenCalledWith(m.ctx, 'get_billing_summary', {});
    expect(screen.getByText('Standard')).toBeTruthy();
    expect(screen.getAllByText(/\$299\.00/).length).toBeGreaterThan(0);
    expect(screen.getByText('Trial')).toBeTruthy();
    expect(screen.getByText(/Trial ends November 13, 2026/)).toBeTruthy();
    expect(screen.getByText(/4 of 3 included/)).toBeTruthy();
    expect(screen.getByText(/1 extra/)).toBeTruthy();
    expect(screen.getByText('$348.00')).toBeTruthy();
    expect(screen.getByText(/FRIEND/)).toBeTruthy();
    const inv = screen.getByRole('link', { name: /A-0001/ });
    expect(inv.getAttribute('href')).toBe('https://invoice.stripe.com/i/1');
    expect(inv.getAttribute('target')).toBe('_blank');
    expect(screen.getByRole('link', { name: 'Download seat report (CSV)' }).getAttribute('href')).toBe('/agency/settings/billing/seats.csv');
  });

  it('offers Subscribe until a subscription exists, then Manage billing', async () => {
    render(await page());
    expect(screen.getByRole('button', { name: 'Add payment method' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Manage billing' })).toBeNull();
    cleanup();
    m.callTool.mockResolvedValue(summary({ state: 'active', dates: { trialEndsAt: null, pilotEndsAt: null, pastDueSince: null, pausesOn: null, cancelAt: null } }));
    render(await page());
    expect(screen.getByRole('button', { name: 'Manage billing' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add payment method' })).toBeNull();
  });

  it('shows the pause date when past due and the done notice for ?done=1', async () => {
    m.callTool.mockResolvedValue(summary({ state: 'past_due', dates: { trialEndsAt: null, pilotEndsAt: null, pastDueSince: '2026-10-24T00:00:00Z', pausesOn: '2026-10-31T00:00:00Z', cancelAt: null } }));
    render(await page({ done: '1' }));
    expect(screen.getByText(/Service pauses October 31, 2026/)).toBeTruthy();
    expect(within(screen.getByRole('status')).getByText(/Thanks/)).toBeTruthy();
  });

  it('404s for every other role and for a support viewer', async () => {
    for (const role of ['account_manager', 'client_owner', 'client_viewer']) {
      m.ctx = { role };
      await expect(page()).rejects.toThrow('NEXT_NOT_FOUND');
    }
    m.viewer = { kind: 'support' };
    m.ctx = { role: 'agency_admin', support: { sessionId: 's', platformUserId: 'op' } };
    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(m.callTool).not.toHaveBeenCalled();
  });
});

describe('billing actions', () => {
  it('checkout and portal call the tool and redirect to the returned Stripe URL', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { url: 'https://checkout.stripe.com/c/1' } });
    await expect(checkoutAction()).rejects.toThrow('REDIRECT:https://checkout.stripe.com/c/1');
    expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'create_checkout_session', {});
    m.runTool.mockResolvedValue({ ok: true, data: { url: 'https://billing.stripe.com/p/1' } });
    await expect(portalAction()).rejects.toThrow('REDIRECT:https://billing.stripe.com/p/1');
    expect(m.runTool).toHaveBeenLastCalledWith(m.ctx, 'create_portal_session', {});
  });

  it('a checkout refusal returns the message instead of redirecting', async () => {
    m.runTool.mockResolvedValue({ ok: false, error: 'This agency already has a subscription.' });
    expect(await checkoutAction()).toEqual({ ok: false, error: 'This agency already has a subscription.' });
  });

  it('redeem returns the invalid_code message on failure and a confirmation on success', async () => {
    const fd = new FormData();
    fd.set('code', '  friend ');
    m.runTool.mockResolvedValue({ ok: false, error: "That code isn't valid for your account." });
    expect(await redeemCodeAction({ ok: true }, fd)).toEqual({ ok: false, error: "That code isn't valid for your account." });
    expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'redeem_discount_code', { code: 'friend' });
    m.runTool.mockResolvedValue({ ok: true, data: { applied: true, appliesAtCheckout: false } });
    expect(await redeemCodeAction({ ok: true }, fd)).toMatchObject({ ok: true, message: expect.stringMatching(/applied/i) });
    m.runTool.mockResolvedValue({ ok: true, data: { applied: false, appliesAtCheckout: true } });
    expect(await redeemCodeAction({ ok: true }, fd)).toMatchObject({ ok: true, message: expect.stringMatching(/checkout/i) });
  });
});
