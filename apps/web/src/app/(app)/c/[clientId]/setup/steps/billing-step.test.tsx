// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
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
