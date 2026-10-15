// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BillingBanner } from './billing-banner';

afterEach(cleanup);
const TRIAL = '2026-11-13T12:00:00Z';
const PAUSE = '2026-10-31T09:00:00Z';

describe('BillingBanner (billing, spec § Enforcement)', () => {
  it('agency admin, trialing: trial end date and a button to the billing page', () => {
    render(<BillingBanner role="agency_admin" state="trialing" trialEndsAt={TRIAL} pausesOn={null} />);
    expect(screen.getByText('Your trial ends November 13, 2026. Add a payment method to keep going.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Add payment method' }).getAttribute('href')).toBe('/agency/settings/billing');
  });

  it('agency admin, past_due: red payment-needed copy with the pause date', () => {
    const { container } = render(<BillingBanner role="agency_admin" state="past_due" trialEndsAt={null} pausesOn={PAUSE} />);
    expect(screen.getByText('Payment needed — service pauses on October 31, 2026.')).toBeTruthy();
    expect(container.querySelector('[data-tone="danger"]')).not.toBeNull();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/agency/settings/billing');
  });

  it('agency admin, read_only: red paused copy', () => {
    const { container } = render(<BillingBanner role="agency_admin" state="read_only" trialEndsAt={null} pausesOn={null} />);
    expect(screen.getByText('Service is paused. Update your payment method to resume.')).toBeTruthy();
    expect(container.querySelector('[data-tone="danger"]')).not.toBeNull();
  });

  it('agency admin: nothing for pilot, active, cancelled or suspended', () => {
    for (const state of ['pilot', 'active', 'cancelled', 'suspended'] as const) {
      const { container, unmount } = render(<BillingBanner role="agency_admin" state={state} trialEndsAt={TRIAL} pausesOn={PAUSE} />);
      expect(container.innerHTML).toBe('');
      unmount();
    }
  });

  it('account manager: the neutral line in past_due and read_only, no amounts, dates or button; nothing otherwise', () => {
    for (const state of ['past_due', 'read_only'] as const) {
      const { container, unmount } = render(<BillingBanner role="account_manager" state={state} trialEndsAt={TRIAL} pausesOn={PAUSE} />);
      expect(screen.getByText("Your agency's account needs attention.")).toBeTruthy();
      expect(container.querySelector('a, button')).toBeNull();
      expect(container.textContent).not.toMatch(/\$|2026/);
      unmount();
    }
    for (const state of ['pilot', 'trialing', 'active', 'cancelled', 'suspended'] as const) {
      const { container, unmount } = render(<BillingBanner role="account_manager" state={state} trialEndsAt={TRIAL} pausesOn={PAUSE} />);
      expect(container.innerHTML).toBe('');
      unmount();
    }
  });

  it('client roles never see a banner', () => {
    for (const role of ['client_owner', 'client_viewer'] as const) {
      for (const state of ['trialing', 'past_due', 'read_only', 'suspended'] as const) {
        const { container, unmount } = render(<BillingBanner role={role} state={state} trialEndsAt={TRIAL} pausesOn={PAUSE} />);
        expect(container.innerHTML).toBe('');
        unmount();
      }
    }
  });
});
