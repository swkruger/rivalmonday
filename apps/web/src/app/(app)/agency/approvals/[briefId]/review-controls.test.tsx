// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { approveAction, autoSendAction, sendNowAction } from './actions';

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
const approveMock = vi.mocked(approveAction);
const sendNowMock = vi.mocked(sendNowAction);

const item = { id: 'i1', ord: 1, competitorId: 'c', competitorName: 'Smith HVAC', headline: 'Smith HVAC cut its AC tune-up to $79', whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r', confidence: 0.9, effort: 'L', impact: 'H', evidenceIds: ['e1', 'e2'], status: 'active', upsellTag: 'ppc_audit' };

describe('approval review controls', () => {
  it('offers editing on a ready brief, with first/last move buttons disabled', () => {
    render(<ReviewItem briefId="b1" clientId="c1" item={item} editable first last />);
    expect(screen.getByRole('button', { name: /edit/i })).toBeTruthy();
    expect((screen.getByRole('button', { name: /move up/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Upsell: ppc_audit')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Evidence 1' }).getAttribute('href')).toBe('/c/c1/evidence/e1');
  });

  it('is read-only once approved, but still ratable', () => {
    render(<ReviewItem briefId="b1" clientId="c1" item={item} editable={false} first last />);
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

  it('keeps the approve message after the page revalidates to approved', async () => {
    approveMock.mockReset();
    approveMock.mockResolvedValueOnce({ ok: true, message: 'Approved — it goes out Monday 07:00. 1 recommendation(s) created.' });
    const { rerender } = render(<ReviewFooter briefId="b1" clientId="c1" status="ready" autoSend={false} />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    await waitFor(() => expect(approveMock).toHaveBeenCalledTimes(1));
    expect((approveMock.mock.calls[0]![1] as FormData).get('briefId')).toBe('b1');
    await screen.findByText(/approved — it goes out monday/i);
    // approveAction revalidates the page, so the footer re-renders with the new status and the button goes away.
    rerender(<ReviewFooter briefId="b1" clientId="c1" status="approved" autoSend={false} />);
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
    expect(screen.getByText(/approved — it goes out monday/i)).toBeTruthy();
  });

  it('keeps the send-now message after the page revalidates to sent', async () => {
    sendNowMock.mockReset();
    sendNowMock.mockResolvedValueOnce({ ok: true, message: 'Sent to 2 recipient(s). The PDF is being prepared.' });
    const { rerender } = render(<ReviewFooter briefId="b1" clientId="c1" status="approved" autoSend={false} />);
    fireEvent.click(screen.getByRole('button', { name: /send now/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /send now/i }));
    await waitFor(() => expect(sendNowMock).toHaveBeenCalledTimes(1));
    await screen.findByText(/sent to 2 recipient/i);
    rerender(<ReviewFooter briefId="b1" clientId="c1" status="sent" autoSend={false} />);
    expect(screen.queryByRole('button', { name: /send now/i })).toBeNull();
    expect(screen.getAllByText(/sent to 2 recipient/i)).toHaveLength(1);
  });

  it('shows only the send message after approve then send now', async () => {
    approveMock.mockReset();
    sendNowMock.mockReset();
    approveMock.mockResolvedValueOnce({ ok: true, message: 'Approved — it goes out Monday 07:00. 1 recommendation(s) created.' });
    sendNowMock.mockResolvedValueOnce({ ok: true, message: 'Sent to 2 recipient(s). The PDF is being prepared.' });
    const { rerender } = render(<ReviewFooter briefId="b1" clientId="c1" status="ready" autoSend={false} />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    await screen.findByText(/approved — it goes out monday/i);
    rerender(<ReviewFooter briefId="b1" clientId="c1" status="approved" autoSend={false} />);
    fireEvent.click(screen.getByRole('button', { name: /send now/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /send now/i }));
    await waitFor(() => expect(sendNowMock).toHaveBeenCalledTimes(1));
    await screen.findByText(/sent to 2 recipient/i);
    rerender(<ReviewFooter briefId="b1" clientId="c1" status="sent" autoSend={false} />);
    expect(screen.getAllByText(/sent to 2 recipient/i)).toHaveLength(1);
    expect(screen.queryByText(/approved — it goes out monday/i)).toBeNull();
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
