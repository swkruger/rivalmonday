import type { ClientBillingState } from '@cs/db';
import { describe, expect, it } from 'vitest';
import { clientBillingPill } from './pill';

const PAUSED = new Date();
const b = (state: ClientBillingState, enabled = true) => ({ state, enabled });

describe('clientBillingPill precedence: Paused > Payment needed > Invited > Paying > Off', () => {
  it.each([
    [PAUSED, b('payment_needed'), 'paused'],
    [PAUSED, b('active'), 'paused'],
    [PAUSED, null, 'paused'],
    [null, b('payment_needed'), 'payment_needed'],
    [null, b('invited'), 'invited'],
    [null, b('active'), 'paying'],
    [null, b('off', false), 'off'],
    [null, b('cancelled'), 'off'],
    [null, b('disconnected'), 'off'],
    [null, b('active', false), 'off'],
    [null, null, 'off'],
  ] as const)('pausedAt=%s billing=%j -> %s', (pausedAt, billing, key) => {
    expect(clientBillingPill({ pausedAt, billing }).key).toBe(key);
  });

  it('labels', () => {
    expect(clientBillingPill({ pausedAt: PAUSED, billing: null }).label).toBe('Paused');
    expect(clientBillingPill({ pausedAt: null, billing: b('payment_needed') }).label).toBe('Payment needed');
  });
});
