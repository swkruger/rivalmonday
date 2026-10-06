// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { autoSendAction } from './actions';

// jsdom has no ResizeObserver; Radix Switch's thumb (`@radix-ui/react-use-size`) needs one to mount at all.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub;
}

vi.mock('./actions', () => ({
  editItemAction: vi.fn(), dropItemAction: vi.fn(), moveItemAction: vi.fn(), rateItemAction: vi.fn(), approveAction: vi.fn(), sendNowAction: vi.fn(), autoSendAction: vi.fn(),
}));
const { ReviewItem, ReviewFooter } = await import('./review-controls');
const autoSendMock = vi.mocked(autoSendAction);

const item = { id: 'i1', ord: 1, competitorId: 'c', competitorName: 'Smith HVAC', headline: 'Smith HVAC cut its AC tune-up to $79', whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r', confidence: 0.9, effort: 'L', impact: 'H', evidenceIds: ['e1', 'e2'], status: 'active', upsellTag: 'ppc_audit' };

describe('approval review controls', () => {
  it('offers editing on a ready brief, with first/last move buttons disabled', () => {
    render(<ReviewItem briefId="b1" item={item} editable first last />);
    expect(screen.getByRole('button', { name: /edit/i })).toBeTruthy();
    expect((screen.getByRole('button', { name: /move up/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Upsell: ppc_audit')).toBeTruthy();
  });

  it('is read-only once approved, but still ratable', () => {
    render(<ReviewItem briefId="b1" item={item} editable={false} first last />);
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Useful' })).toBeTruthy();
  });

  it('shows approve only for a ready brief and send now for ready or approved', () => {
    const { rerender } = render(<ReviewFooter briefId="b1" clientId="c1" status="ready" autoSend={false} />);
    expect(screen.getByRole('button', { name: /approve/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /send now/i })).toBeTruthy();
    rerender(<ReviewFooter briefId="b1" clientId="c1" status="sent" autoSend={false} />);
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /send now/i })).toBeNull();
  });

  it('submits the freshly toggled value, not the stale pre-toggle one', async () => {
    autoSendMock.mockReset();
    autoSendMock.mockResolvedValueOnce({ ok: true });
    render(<ReviewFooter briefId="b1" clientId="c1" status="ready" autoSend={false} />);
    const switchEl = screen.getByRole('switch');
    expect(switchEl.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(switchEl);
    await waitFor(() => expect(autoSendMock).toHaveBeenCalledTimes(1));

    const fd = autoSendMock.mock.calls[0]![1] as FormData;
    expect(fd.get('enabled')).toBe('true'); // the new value, never the pre-toggle 'false'
    expect(fd.get('clientId')).toBe('c1');
    expect(fd.get('briefId')).toBe('b1');
  });

  it('reverts to the original value and shows the error when the action fails', async () => {
    autoSendMock.mockReset();
    autoSendMock.mockResolvedValueOnce({ ok: false, error: 'Could not update auto-send' });
    render(<ReviewFooter briefId="b1" clientId="c1" status="ready" autoSend={false} />);
    const switchEl = screen.getByRole('switch');

    fireEvent.click(switchEl);
    expect(switchEl.getAttribute('aria-checked')).toBe('true'); // optimistic flip while in flight

    await waitFor(() => expect(switchEl.getAttribute('aria-checked')).toBe('false')); // rolled back
    expect(screen.getByRole('alert').textContent).toMatch(/could not update auto-send/i);
  });
});
