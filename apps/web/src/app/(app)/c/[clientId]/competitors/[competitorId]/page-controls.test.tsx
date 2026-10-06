// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FormResult } from '@/server/forms';

// jsdom has no ResizeObserver; Radix Switch's thumb (`@radix-ui/react-use-size`) needs one to mount at all.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;
}

/**
 * `useActionState` is replaced with a tiny controllable stand-in so the test can drive exactly what
 * `PinPageSwitch`'s reconcile effect (keyed on the returned `state`) sees, across renders — the same technique
 * `client-profile-form.test.tsx` uses, but with a mutable harness instead of a fixed tuple so the test can move
 * the mocked action from pending to a real result between a toggle and the assertion.
 */
const harness: { state: FormResult; pending: boolean } = { state: { ok: true }, pending: false };
vi.mock('react', async (orig) => ({
  ...(await orig<typeof import('react')>()),
  useActionState: () => [harness.state, vi.fn(), harness.pending],
}));
const { PinPageSwitch } = await import('./page-controls');

const PAGE = { id: 'p1', url: 'https://smithhvac.com/pricing', pageType: 'pricing', source: 'manual', pinned: false, active: true, cadence: 'daily', lastCapturedAt: null };

describe('PinPageSwitch', () => {
  it('reverts to the last confirmed value when set_page_pin fails', () => {
    harness.state = { ok: true };
    harness.pending = false;
    const { rerender } = render(<PinPageSwitch clientId="c1" competitorId="comp1" page={PAGE} />);
    const switchEl = screen.getByRole('switch');
    expect(switchEl.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(switchEl);
    expect(switchEl.getAttribute('aria-checked')).toBe('true'); // optimistic flip
    expect(switchEl.hasAttribute('disabled')).toBe(true); // guarded while in flight

    harness.state = { ok: false, error: 'Could not update the pin' };
    rerender(<PinPageSwitch clientId="c1" competitorId="comp1" page={PAGE} />);

    expect(switchEl.getAttribute('aria-checked')).toBe('false'); // rolled back, not stuck on the failed guess
    expect(switchEl.hasAttribute('disabled')).toBe(false); // unblocked again after the result lands
    expect(screen.getByRole('alert').textContent).toMatch(/could not update the pin/i);
  });

  it('keeps the confirmed value and clears the error on a later success', () => {
    harness.state = { ok: true };
    harness.pending = false;
    const { rerender } = render(<PinPageSwitch clientId="c1" competitorId="comp1" page={PAGE} />);
    const switchEl = screen.getByRole('switch');

    fireEvent.click(switchEl);
    harness.state = { ok: true };
    rerender(<PinPageSwitch clientId="c1" competitorId="comp1" page={PAGE} />);

    expect(switchEl.getAttribute('aria-checked')).toBe('true'); // kept, now confirmed
    expect(switchEl.hasAttribute('disabled')).toBe(false);

    // A second toggle, failing this time, must roll back to the now-confirmed `true` — not the original `false`.
    fireEvent.click(switchEl);
    harness.state = { ok: false, error: 'Could not update the pin' };
    rerender(<PinPageSwitch clientId="c1" competitorId="comp1" page={PAGE} />);
    expect(switchEl.getAttribute('aria-checked')).toBe('true');
  });

  it('ignores a toggle while a previous one is still in flight', () => {
    harness.state = { ok: true };
    harness.pending = false;
    render(<PinPageSwitch clientId="c1" competitorId="comp1" page={PAGE} />);
    const switchEl = screen.getByRole('switch');

    fireEvent.click(switchEl); // starts submitting; switch disables itself
    expect(switchEl.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(switchEl); // a disabled Radix switch does not call onCheckedChange again
    expect(switchEl.getAttribute('aria-checked')).toBe('true'); // unchanged — no second attempt recorded
  });
});
