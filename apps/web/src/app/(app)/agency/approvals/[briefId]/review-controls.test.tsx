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
const { mondaySendTime } = await import('./send-time');
const autoSendMock = vi.mocked(autoSendAction);
const approveMock = vi.mocked(approveAction);
const sendNowMock = vi.mocked(sendNowAction);

const item = { id: 'i1', ord: 1, competitorId: 'c', subject: 'competitor' as const, competitorName: 'Smith HVAC', headline: 'Smith HVAC cut its AC tune-up to $79', whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r', confidence: 0.9, effort: 'L', impact: 'H', evidenceIds: ['e1', 'e2'], status: 'active', upsellTag: 'ppc_audit' };

describe('approval review controls', () => {
  it('offers editing on a ready brief, with first/last move buttons disabled', () => {
    render(<ReviewItem briefId="b1" clientId="c1" item={item} editable first last />);
    expect(screen.getByRole('button', { name: /edit/i })).toBeTruthy();
    expect((screen.getByRole('button', { name: /move up/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Upsell: ppc_audit')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Evidence 1' }).getAttribute('href')).toBe('/c/c1/evidence/e1');
  });

  it('words the confidence next to the amber border', () => {
    const { rerender } = render(<ReviewItem briefId="b1" clientId="c1" item={item} editable first last />);
    expect(screen.getByText('High confidence 90%')).toBeTruthy();
    rerender(<ReviewItem briefId="b1" clientId="c1" item={{ ...item, confidence: 0.6 }} editable first last />);
    expect(screen.getByText('Confidence 60%')).toBeTruthy();
  });

  it('is read-only once approved, but still ratable', () => {
    render(<ReviewItem briefId="b1" clientId="c1" item={item} editable={false} first last />);
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Useful' })).toBeTruthy();
  });

  it('shows approve only for a ready brief and send now for ready or approved', () => {
    const { rerender } = render(<ReviewFooter sendTime="Monday 7:00 AM CT" briefId="b1" clientId="c1" status="ready" autoSend={false} />);
    expect(screen.getByRole('button', { name: /approve/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /send now/i })).toBeTruthy();
    rerender(<ReviewFooter sendTime="Monday 7:00 AM CT" briefId="b1" clientId="c1" status="sent" autoSend={false} />);
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /send now/i })).toBeNull();
  });

  it('a starting point has no auto-send switch and approves with its kind (sent straight away)', async () => {
    approveMock.mockReset();
    approveMock.mockResolvedValueOnce({ ok: true, message: 'Approved — sent to the client. 0 recommendation(s) created.' });
    render(<ReviewFooter sendTime="Monday 7:00 AM CT" briefId="b1" clientId="c1" status="ready" autoSend={false} startingPoint />);
    expect(screen.queryByRole('switch')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Approve and send' }));
    await waitFor(() => expect(approveMock).toHaveBeenCalledTimes(1));
    expect((approveMock.mock.calls[0]![1] as FormData).get('kind')).toBe('starting_point');
    await screen.findByText(/sent to the client/i);
  });
  it('a starting point keeps its approve message when the page revalidates straight to sent', async () => {
    approveMock.mockReset();
    approveMock.mockResolvedValueOnce({ ok: true, message: 'Approved — sent to the client. 0 recommendation(s) created.' });
    const { rerender } = render(<ReviewFooter sendTime="Monday 7:00 AM CT" briefId="b1" clientId="c1" status="ready" autoSend={false} startingPoint />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve and send' }));
    await screen.findByText(/sent to the client/i);
    rerender(<ReviewFooter sendTime="Monday 7:00 AM CT" briefId="b1" clientId="c1" status="sent" autoSend={false} startingPoint />);
    expect(screen.getByText(/sent to the client/i)).toBeTruthy();
  });

  it('keeps the approve message after the page revalidates to approved', async () => {
    approveMock.mockReset();
    approveMock.mockResolvedValueOnce({ ok: true, message: 'Approved — it goes out Monday 07:00. 1 recommendation(s) created.' });
    const { rerender } = render(<ReviewFooter sendTime="Monday 7:00 AM CT" briefId="b1" clientId="c1" status="ready" autoSend={false} />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    await waitFor(() => expect(approveMock).toHaveBeenCalledTimes(1));
    expect((approveMock.mock.calls[0]![1] as FormData).get('briefId')).toBe('b1');
    await screen.findByText(/approved — it goes out monday/i);
    // approveAction revalidates the page, so the footer re-renders with the new status and the button goes away.
    rerender(<ReviewFooter sendTime="Monday 7:00 AM CT" briefId="b1" clientId="c1" status="approved" autoSend={false} />);
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
    expect(screen.getByText(/approved — it goes out monday/i)).toBeTruthy();
  });

  it('keeps the send-now message after the page revalidates to sent', async () => {
    sendNowMock.mockReset();
    sendNowMock.mockResolvedValueOnce({ ok: true, message: 'Sent to 2 recipient(s). The PDF is being prepared.' });
    const { rerender } = render(<ReviewFooter sendTime="Monday 7:00 AM CT" briefId="b1" clientId="c1" status="approved" autoSend={false} />);
    fireEvent.click(screen.getByRole('button', { name: /send now/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /send now/i }));
    await waitFor(() => expect(sendNowMock).toHaveBeenCalledTimes(1));
    await screen.findByText(/sent to 2 recipient/i);
    rerender(<ReviewFooter sendTime="Monday 7:00 AM CT" briefId="b1" clientId="c1" status="sent" autoSend={false} />);
    expect(screen.queryByRole('button', { name: /send now/i })).toBeNull();
    expect(screen.getAllByText(/sent to 2 recipient/i)).toHaveLength(1);
  });

  it('shows only the send message after approve then send now', async () => {
    approveMock.mockReset();
    sendNowMock.mockReset();
    approveMock.mockResolvedValueOnce({ ok: true, message: 'Approved — it goes out Monday 07:00. 1 recommendation(s) created.' });
    sendNowMock.mockResolvedValueOnce({ ok: true, message: 'Sent to 2 recipient(s). The PDF is being prepared.' });
    const { rerender } = render(<ReviewFooter sendTime="Monday 7:00 AM CT" briefId="b1" clientId="c1" status="ready" autoSend={false} />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    await screen.findByText(/approved — it goes out monday/i);
    rerender(<ReviewFooter sendTime="Monday 7:00 AM CT" briefId="b1" clientId="c1" status="approved" autoSend={false} />);
    fireEvent.click(screen.getByRole('button', { name: /send now/i }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /send now/i }));
    await waitFor(() => expect(sendNowMock).toHaveBeenCalledTimes(1));
    await screen.findByText(/sent to 2 recipient/i);
    rerender(<ReviewFooter sendTime="Monday 7:00 AM CT" briefId="b1" clientId="c1" status="sent" autoSend={false} />);
    expect(screen.getAllByText(/sent to 2 recipient/i)).toHaveLength(1);
    expect(screen.queryByText(/approved — it goes out monday/i)).toBeNull();
  });

  it('submits the freshly toggled value, not the stale pre-toggle one', async () => {
    autoSendMock.mockReset();
    autoSendMock.mockResolvedValueOnce({ ok: true });
    render(<ReviewFooter sendTime="Monday 7:00 AM CT" briefId="b1" clientId="c1" status="ready" autoSend={false} />);
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
    render(<ReviewFooter sendTime="Monday 7:00 AM CT" briefId="b1" clientId="c1" status="ready" autoSend={false} />);
    const switchEl = screen.getByRole('switch');

    fireEvent.click(switchEl);
    expect(switchEl.getAttribute('aria-checked')).toBe('true'); // optimistic flip while in flight

    await waitFor(() => expect(switchEl.getAttribute('aria-checked')).toBe('false')); // rolled back
    expect(screen.getByRole('alert').textContent).toMatch(/could not update auto-send/i);
  });
});

describe('15c-2a review page', () => {
  it('rating buttons expose aria-pressed', async () => {
    const rate = vi.mocked((await import('./actions')).rateItemAction);
    rate.mockResolvedValue({ ok: true, message: 'Thanks — rating saved.' });
    render(<ReviewItem briefId="b1" clientId="c1" item={item} editable={false} first last />);
    const useful = screen.getByRole('button', { name: 'Useful' });
    const notUseful = screen.getByRole('button', { name: 'Not useful' });
    expect(useful.getAttribute('aria-pressed')).toBe('false');
    expect(notUseful.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(useful);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Useful' }).getAttribute('aria-pressed')).toBe('true'));
    expect(screen.getByRole('button', { name: 'Not useful' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('send time names the client zone', () => {
    render(<ReviewFooter briefId="b1" clientId="c1" status="ready" autoSend={false} sendTime={mondaySendTime('America/Chicago')} />);
    expect(screen.getByRole('button', { name: 'Approve · send Monday 7:00 AM CT' })).toBeTruthy();
    expect(screen.getByText('Send untouched briefs automatically on Monday 7:00 AM CT')).toBeTruthy();
    expect(mondaySendTime('America/New_York')).toBe('Monday 7:00 AM ET');
    expect(mondaySendTime('Not/AZone')).toBe('Monday 7:00 AM UTC');
  });
});
