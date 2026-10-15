// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BILLING_STATE_LABEL, BillingStatePill } from './billing-state-pill';

afterEach(cleanup);

describe('BillingStatePill', () => {
  it('uses the console label map for every state', () => {
    expect(BILLING_STATE_LABEL).toEqual({
      pilot: 'Pilot', trialing: 'Trial', active: 'Active', past_due: 'Past due', read_only: 'Paused', suspended: 'Suspended', cancelled: 'Cancelled',
    });
  });

  it('renders the label as text', () => {
    render(<BillingStatePill state="past_due" />);
    expect(screen.getByText('Past due')).toBeTruthy();
  });
});
