// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({ saveDeliveryAction: vi.fn(), addRecipientAction: vi.fn(), deactivateRecipientAction: vi.fn() }));

vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
const { DeliveryForm } = await import('./delivery-controls');

afterEach(cleanup);

describe('DeliveryForm alert modes', () => {
  it('labels the default alert mode "I review alerts first", never "After AM check"', () => {
    render(<DeliveryForm clientId="c1" alertMode="after_am_check" briefAutoSend={false} timezone="UTC" timezoneOptions={['UTC']} />);
    expect(screen.getByText(/I review alerts first/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/AM check/);
  });
});
