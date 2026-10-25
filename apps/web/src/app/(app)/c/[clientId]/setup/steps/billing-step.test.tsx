// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BillingStep } from './billing-step';

afterEach(cleanup);
const noop = () => {};

describe('BillingStep notes', () => {
  it('a skipped (plan-ineligible) step shows the plan note even when Connect is not ready', () => {
    render(<BillingStep isAdmin prefill={{ ready: false, priceCents: null, setupFeeCents: null }} skipped pending={false} onEnable={noop} onSkip={noop} />);
    expect(screen.getByText('Billing for clients starts once your plan is active.')).toBeTruthy();
    expect(screen.queryByText(/Connect Stripe in Settings/)).toBeNull();
  });

  it('not skipped and Connect not ready shows the Connect note', () => {
    render(<BillingStep isAdmin prefill={{ ready: false, priceCents: null, setupFeeCents: null }} skipped={false} pending={false} onEnable={noop} onSkip={noop} />);
    expect(screen.getByText(/Connect Stripe in Settings → Billing/)).toBeTruthy();
  });

  it('billing step links to agency billing', () => {
    render(<BillingStep isAdmin prefill={{ ready: false, priceCents: null, setupFeeCents: null }} skipped={false} pending={false} onEnable={noop} onSkip={noop} />);
    expect(screen.getByRole('link', { name: 'Connect Stripe in Settings → Billing' }).getAttribute('href')).toBe('/agency/settings/billing');
  });
});

describe('BillingStep confirm', () => {
  const ready = { ready: true, priceCents: 24900, setupFeeCents: 9900 };
  const openConfirm = () => {
    const onEnable = vi.fn();
    render(<BillingStep isAdmin prefill={ready} skipped={false} pending={false} onEnable={onEnable} onSkip={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'Turn on billing and email the payment link' }));
    return onEnable;
  };

  it('opening the dialog does not enable billing; it names the price and setup fee', async () => {
    const onEnable = openConfirm();
    expect(await screen.findByRole('heading', { name: 'Turn on billing?' })).toBeTruthy();
    expect(screen.getByText('The owner gets an email with a payment link for $249/month plus $99 setup.')).toBeTruthy();
    expect(onEnable).not.toHaveBeenCalled();
  });

  it('Cancel does not call onEnable', async () => {
    const onEnable = openConfirm();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Turn on billing?' })).toBeNull());
    expect(onEnable).not.toHaveBeenCalled();
  });

  it('Confirm calls onEnable once with the typed price and fee', async () => {
    const onEnable = openConfirm();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on billing' }));
    await waitFor(() => expect(onEnable).toHaveBeenCalledTimes(1));
    expect(onEnable).toHaveBeenCalledWith('249', '99');
  });

  it('without a setup fee the body names the monthly price only', async () => {
    const onEnable = vi.fn();
    render(<BillingStep isAdmin prefill={{ ready: true, priceCents: 24900, setupFeeCents: null }} skipped={false} pending={false} onEnable={onEnable} onSkip={noop} />);
    fireEvent.click(screen.getByRole('button', { name: 'Turn on billing and email the payment link' }));
    expect(await screen.findByText('The owner gets an email with a payment link for $249/month.')).toBeTruthy();
  });
});
