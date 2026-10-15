// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FormError } from './form-error';

afterEach(cleanup);
const cap = { ok: false, error: "You've used your 3 included clients. Upgrade to add more.", code: 'billing_seat_limit' } as const;

describe('FormError (billing cap Upgrade prompt)', () => {
  it('shows the message and, for an agency admin on a seat-limit refusal, an Upgrade link to billing', () => {
    render(<FormError state={cap} canUpgrade />);
    expect(screen.getByRole('alert').textContent).toContain("You've used your 3 included clients. Upgrade to add more.");
    expect(screen.getByRole('link', { name: 'Upgrade' }).getAttribute('href')).toBe('/agency/settings/billing');
  });

  it('account managers only see the message', () => {
    render(<FormError state={cap} canUpgrade={false} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('other errors never get the link; success renders nothing', () => {
    const { container, rerender } = render(<FormError state={{ ok: false, error: 'Choose a role' }} canUpgrade />);
    expect(screen.queryByRole('link')).toBeNull();
    rerender(<FormError state={{ ok: true }} canUpgrade />);
    expect(container.innerHTML).toBe('');
  });
});
