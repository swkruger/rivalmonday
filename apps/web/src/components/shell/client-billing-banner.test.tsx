// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ClientBillingBanner } from './client-billing-banner';

afterEach(cleanup);
const C = '00000000-0000-4000-8000-0000000000a1';
const show = (role: string, paused: boolean, paymentNeeded: boolean) =>
  render(<ClientBillingBanner role={role} clientId={C} agencyName="Cool Agency" paused={paused} paymentNeeded={paymentNeeded} />);

describe('ClientBillingBanner (9b spec § UI)', () => {
  it('payment needed: the owner sees the binding copy and a link to the billing page', () => {
    show('client_owner', false, true);
    expect(screen.getByText('Payment needed — please update your payment method.')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe(`/c/${C}/settings/billing`);
  });

  it('payment needed: a viewer sees nothing billing-related (f7)', () => {
    const { container } = show('client_viewer', false, true);
    expect(container.textContent).toBe('');
  });

  it('paused: every client role sees the agency-named copy, with no link', () => {
    for (const role of ['client_owner', 'client_viewer']) {
      const { container, unmount } = show(role, true, false);
      expect(container.textContent).toBe('Monitoring is paused. Please contact Cool Agency.');
      expect(container.querySelector('a')).toBeNull();
      unmount();
    }
  });

  it('paused wins over payment needed', () => {
    const { container } = show('client_owner', true, true);
    expect(container.textContent).toBe('Monitoring is paused. Please contact Cool Agency.');
  });

  it('agency roles and healthy clients see no client banner', () => {
    for (const role of ['agency_admin', 'account_manager']) expect(show(role, true, true).container.textContent).toBe('');
    expect(show('client_owner', false, false).container.textContent).toBe('');
  });

  it('never names the platform', () => {
    const a = show('client_owner', true, false).container.textContent;
    cleanup();
    const b = show('client_owner', false, true).container.textContent;
    expect(`${a} ${b}`).not.toMatch(/rival\s*monday/i);
  });
});
