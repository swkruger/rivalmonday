// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// jsdom has no ResizeObserver; Radix Switch's thumb (`@radix-ui/react-use-size`) needs one to mount at all.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;
}

const setPinAction = vi.fn();
vi.mock('../actions', () => ({ setPinAction: (...a: unknown[]) => setPinAction(...a), addPageAction: vi.fn() }));
const { PinPageSwitch } = await import('./page-controls');

const page = { id: 'p1', url: 'https://smith.example/pricing', pageType: 'pricing', source: 'discovered', pinned: false, active: true, cadence: 'daily', lastCapturedAt: null };

describe('PinPageSwitch (decision 17)', () => {
  it('posts the new value and shows a refusal, falling back to the server value', async () => {
    setPinAction.mockResolvedValueOnce({ ok: false, error: 'Not found' });
    render(<PinPageSwitch clientId="c1" competitorId="k1" page={page} />);
    const sw = screen.getByRole('switch', { name: `Pinned — ${page.url}` });
    fireEvent.click(sw);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Not found'));
    const fd = setPinAction.mock.calls[0]![1] as FormData;
    expect([fd.get('pageId'), fd.get('pinned')]).toEqual(['p1', 'true']);
    expect(sw.getAttribute('aria-checked')).toBe('false');
  });
});
