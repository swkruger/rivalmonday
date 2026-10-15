// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ ctx: { role: 'agency_admin' } as Record<string, unknown>, runTool: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: { kind: 'user' }, ctx: m.ctx }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: vi.fn() }));
const { ClientBillingControls, ClientBillingPill } = await import('./client-billing-controls');
const { clientBillingAction } = await import('@/app/(app)/agency/settings/billing/client-billing/actions');

const C = '22222222-2222-4222-8222-222222222222';
const base = { clientId: C, clientName: 'Target Plumbing' };
const billing = (state: string, enabled = true) => ({ state, enabled }) as never;

beforeEach(() => {
  m.ctx = { role: 'agency_admin' };
  m.runTool.mockReset().mockResolvedValue({ ok: true, data: {} });
});
afterEach(cleanup);

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Billing actions' }));
const names = () => screen.getAllByRole('button').map((b) => b.textContent);

describe('ClientBillingPill', () => {
  it.each([['paused', 'Paused'], ['payment_needed', 'Payment needed'], ['invited', 'Invited'], ['paying', 'Paying'], ['off', 'Off']])('renders %s as %s', (key, label) => {
    render(<ClientBillingPill pill={{ key, label } as never} />);
    expect(screen.getByText(label)).toBeTruthy();
  });
});

describe('ClientBillingControls', () => {
  it('admin, billing off: Turn on billing and Pause, no Resend/Change price/Turn off', () => {
    render(<ClientBillingControls {...base} role="agency_admin" pill={{ key: 'off', label: 'Off' }} billing={billing('off', false)} />);
    open();
    expect(names()).toEqual(expect.arrayContaining(['Turn on billing', 'Pause']));
    for (const n of ['Resend payment link', 'Change price', 'Turn off billing', 'Resume']) expect(screen.queryByRole('button', { name: n })).toBeNull();
  });

  it('admin, payment needed: Resend link, Change price, Turn off billing, Pause', () => {
    render(<ClientBillingControls {...base} role="agency_admin" pill={{ key: 'payment_needed', label: 'Payment needed' }} billing={billing('payment_needed')} />);
    open();
    expect(names()).toEqual(expect.arrayContaining(['Resend payment link', 'Change price', 'Turn off billing', 'Pause']));
    expect(screen.queryByRole('button', { name: 'Turn on billing' })).toBeNull();
  });

  it('paused shows Resume instead of Pause', () => {
    render(<ClientBillingControls {...base} role="agency_admin" pill={{ key: 'paused', label: 'Paused' }} billing={billing('active')} />);
    open();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
  });

  it('account manager sees only Pause / Resume, never billing actions', () => {
    render(<ClientBillingControls {...base} role="account_manager" pill={{ key: 'payment_needed', label: 'Payment needed' }} billing={billing('payment_needed')} />);
    open();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    for (const n of ['Turn on billing', 'Resend payment link', 'Change price', 'Turn off billing']) expect(screen.queryByRole('button', { name: n })).toBeNull();
    expect(screen.queryByText(/\$\d/)).toBeNull();
  });

  it('Turn off billing needs a second explicit confirm', () => {
    render(<ClientBillingControls {...base} role="agency_admin" pill={{ key: 'paying', label: 'Paying' }} billing={billing('active')} />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Turn off billing' }));
    expect(screen.getByRole('button', { name: 'Yes, turn off billing' })).toBeTruthy();
  });

  it('Change price offers Next bill / New sign-ups only', () => {
    render(<ClientBillingControls {...base} role="agency_admin" pill={{ key: 'paying', label: 'Paying' }} billing={billing('active')} />);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Change price' }));
    expect(screen.getByLabelText('Next bill')).toBeTruthy();
    expect(screen.getByLabelText('New sign-ups only')).toBeTruthy();
    expect(screen.getByLabelText('New monthly price ($)')).toBeTruthy();
  });
});

describe('clientBillingAction', () => {
  const fd = (o: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(o)) f.set(k, v);
    return f;
  };
  it('maps each intent to its tool', async () => {
    await clientBillingAction({ ok: true }, fd({ intent: 'enable', clientId: C }));
    expect(m.runTool).toHaveBeenLastCalledWith(m.ctx, 'enable_client_billing', { clientId: C });
    await clientBillingAction({ ok: true }, fd({ intent: 'resend', clientId: C }));
    expect(m.runTool).toHaveBeenLastCalledWith(m.ctx, 'resend_client_payment_link', { clientId: C });
    await clientBillingAction({ ok: true }, fd({ intent: 'disable', clientId: C, confirm: 'yes' }));
    expect(m.runTool).toHaveBeenLastCalledWith(m.ctx, 'disable_client_billing', { clientId: C, confirm: true });
    await clientBillingAction({ ok: true }, fd({ intent: 'pause', clientId: C }));
    expect(m.runTool).toHaveBeenLastCalledWith(m.ctx, 'pause_client', { clientId: C });
    await clientBillingAction({ ok: true }, fd({ intent: 'resume', clientId: C }));
    expect(m.runTool).toHaveBeenLastCalledWith(m.ctx, 'resume_client', { clientId: C });
    await clientBillingAction({ ok: true }, fd({ intent: 'set_price', clientId: C, price: '349', applyTo: 'new_only' }));
    expect(m.runTool).toHaveBeenLastCalledWith(m.ctx, 'set_client_price', { clientId: C, priceCents: 34900, applyTo: 'new_only' });
  });
  it('disable without confirm is refused locally; a refusal passes through; linkResent is reported', async () => {
    expect((await clientBillingAction({ ok: true }, fd({ intent: 'disable', clientId: C }))).ok).toBe(false);
    expect(m.runTool).not.toHaveBeenCalled();
    m.runTool.mockResolvedValue({ ok: false, error: 'Resuming would put you over your client limit.' });
    expect(await clientBillingAction({ ok: true }, fd({ intent: 'resume', clientId: C }))).toEqual({ ok: false, error: 'Resuming would put you over your client limit.' });
    m.runTool.mockResolvedValue({ ok: true, data: { linkResent: true } });
    expect(await clientBillingAction({ ok: true }, fd({ intent: 'set_price', clientId: C, price: '10', applyTo: 'next_bill' }))).toMatchObject({ ok: true, message: expect.stringMatching(/payment link/i) });
  });
  it('rejects an unknown intent and a non-uuid client', async () => {
    expect((await clientBillingAction({ ok: true }, fd({ intent: 'x', clientId: C }))).ok).toBe(false);
    expect((await clientBillingAction({ ok: true }, fd({ intent: 'pause', clientId: 'nope' }))).ok).toBe(false);
  });
});
