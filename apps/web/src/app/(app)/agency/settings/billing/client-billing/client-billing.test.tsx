// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ ctx: { role: 'agency_admin' } as Record<string, unknown>, runTool: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: { kind: 'user' }, ctx: m.ctx }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
const { ClientBillingSection } = await import('./section');
const { connectAction, disconnectAction, saveDefaultsAction } = await import('./actions');
const { parseDollars, formatMoney } = await import('./money');

const status = (over: Record<string, unknown> = {}) => ({
  status: 'connected', chargesEnabled: true, detailsSubmitted: true, defaultPriceCents: 29900, defaultSetupFeeCents: 5000, currency: 'usd',
  autoPauseAfterDays: 14, connectedAt: null, disconnectedAt: null, billingConfigured: true, ...over,
});
const revenue = { currency: 'usd', mrrCents: 59800, payingCount: 2, paymentNeededCount: 1, invitedCount: 0, ourCostCents: 34900, marginCents: 24900 };

beforeEach(() => {
  m.ctx = { role: 'agency_admin' };
  m.runTool.mockReset();
});
afterEach(cleanup);

describe('client-billing money', () => {
  it('parses dollars to cents and rejects junk', () => {
    expect(parseDollars('49')).toBe(4900);
    expect(parseDollars('$1,249.50')).toBe(124950);
    expect(parseDollars('')).toBeNull();
    expect(parseDollars('abc')).toBeNull();
    expect(parseDollars('-5')).toBeNull();
  });
  it('shows two decimals only when cents are non-zero', () => {
    expect(formatMoney(59800)).toBe('$598');
    expect(formatMoney(4950)).toBe('$49.50');
  });
});

describe('client billing section', () => {
  it('billing not configured: a note and no Connect button', () => {
    render(<ClientBillingSection status={status({ billingConfigured: false, status: 'not_connected' }) as never} revenue={null} connect={undefined} />);
    expect(screen.getByText(/isn't available/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Stripe/ })).toBeNull();
  });

  it.each([['not_connected', 'Connect Stripe'], ['disconnected', 'Connect Stripe'], ['pending', 'Finish Stripe setup'], ['restricted', 'Finish Stripe setup']])(
    '%s shows %s and no defaults form',
    (st, label) => {
      render(<ClientBillingSection status={status({ status: st }) as never} revenue={null} connect={undefined} />);
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Save defaults' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Disconnect Stripe' })).toBeNull();
    },
  );

  it('connected: defaults prefilled in dollars, revenue card copy, Disconnect trigger', () => {
    render(<ClientBillingSection status={status() as never} revenue={revenue} connect={undefined} />);
    expect((screen.getByLabelText('Monthly price ($)') as HTMLInputElement).value).toBe('299');
    expect((screen.getByLabelText('Setup fee ($)') as HTMLInputElement).value).toBe('50');
    expect((screen.getByLabelText('Pause unpaid clients after (days)') as HTMLInputElement).value).toBe('14');
    expect(screen.getByText('You bill $598/mo · Rival Monday costs you $349/mo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save defaults' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Disconnect Stripe' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Connect Stripe' })).toBeNull();
  });

  it('?connect messages', () => {
    render(<ClientBillingSection status={status() as never} revenue={revenue} connect="done" />);
    expect(screen.getByText('Stripe connected.')).toBeTruthy();
    cleanup();
    render(<ClientBillingSection status={status({ status: 'pending' }) as never} revenue={null} connect="done" />);
    expect(screen.getByText("Stripe setup isn't finished yet.")).toBeTruthy();
    expect(screen.queryByText('Stripe connected.')).toBeNull();
    cleanup();
    render(<ClientBillingSection status={status({ status: 'pending' }) as never} revenue={null} connect="retry" />);
    expect(screen.getByText("Stripe setup isn't finished yet.")).toBeTruthy();
  });

  it('the disconnect dialog shows the binding copy and only the confirm button disconnects', () => {
    render(<ClientBillingSection status={status() as never} revenue={revenue} connect={undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Stripe' }));
    expect(screen.getByText('Disconnect Stripe?')).toBeTruthy();
    expect(screen.getByText("Your clients' subscriptions keep running in your Stripe account, but Rival Monday will stop tracking payments.")).toBeTruthy();
    expect(m.runTool).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Yes, disconnect' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });
});

describe('client billing actions', () => {
  it('connect redirects to the Stripe URL, a refusal returns the copy', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: { url: 'https://connect.stripe.com/x' } });
    await expect(connectAction()).rejects.toThrow('REDIRECT:https://connect.stripe.com/x');
    expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'start_stripe_connect', {});
    m.runTool.mockResolvedValue({ ok: false, error: 'nope' });
    expect(await connectAction()).toEqual({ ok: false, error: 'nope' });
  });

  it('disconnect refuses without the confirm field and sends confirm:true with it', async () => {
    const r = await disconnectAction({ ok: true }, new FormData());
    expect(r.ok).toBe(false);
    expect(m.runTool).not.toHaveBeenCalled();
    m.runTool.mockResolvedValue({ ok: true, data: { ok: true, changed: true } });
    const fd = new FormData();
    fd.set('confirm', 'yes');
    expect(await disconnectAction({ ok: true }, fd)).toMatchObject({ ok: true });
    expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'disconnect_stripe', { confirm: true });
  });

  it('save defaults converts dollars to cents; blank auto-pause clears it; bad price is refused locally', async () => {
    m.runTool.mockResolvedValue({ ok: true, data: {} });
    const fd = new FormData();
    fd.set('price', '299');
    fd.set('setupFee', '49.50');
    fd.set('autoPauseAfterDays', '');
    await saveDefaultsAction({ ok: true }, fd);
    expect(m.runTool).toHaveBeenCalledWith(m.ctx, 'set_client_billing_defaults', { priceCents: 29900, setupFeeCents: 4950, autoPauseAfterDays: null });
    m.runTool.mockClear();
    const bad = new FormData();
    bad.set('price', 'abc');
    expect(await saveDefaultsAction({ ok: true }, bad)).toMatchObject({ ok: false });
    expect(m.runTool).not.toHaveBeenCalled();
  });
});
