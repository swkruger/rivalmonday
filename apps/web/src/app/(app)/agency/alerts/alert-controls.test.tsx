// @vitest-environment jsdom
import type { AlertQueueRow } from '@cs/tools';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({ approveAlertAction: vi.fn(), dismissAlertAction: vi.fn() }));
const { approveAlertAction, dismissAlertAction } = await import('./actions');
const { AlertList } = await import('./alert-controls');
const approveMock = vi.mocked(approveAlertAction);
const dismissMock = vi.mocked(dismissAlertAction);

const base: AlertQueueRow = {
  id: 'a1', clientId: 'c1', clientName: 'A1 HVAC', competitorName: 'Smith HVAC', headline: 'Price cut', body: 'Smith HVAC cut tune-ups to $59.',
  score: 82, status: 'pending_review', heldForDigest: false, written: 'model', evidenceCount: 1, createdAt: '2026-10-01T00:00:00.000Z',
};

describe('AlertList', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows Approve & send for a pending_review alert', () => {
    render(<AlertList items={[base]} />);
    expect(screen.getByRole('button', { name: /approve/i })).toBeTruthy();
  });

  it('hides Approve & send once the alert is no longer pending_review', () => {
    render(<AlertList items={[{ ...base, status: 'approved' }]} />);
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
  });

  it('shows the digest-held badge when heldForDigest is true', () => {
    render(<AlertList items={[{ ...base, heldForDigest: true }]} />);
    expect(screen.getByText('Held for the 17:00 digest')).toBeTruthy();
  });

  it('does not show the digest-held badge when heldForDigest is false', () => {
    render(<AlertList items={[base]} />);
    expect(screen.queryByText('Held for the 17:00 digest')).toBeNull();
  });

  it('shows the template note only when written is "template"', () => {
    render(<AlertList items={[{ ...base, written: 'template' }]} />);
    expect(screen.getByText(/couldn’t verify its own wording/)).toBeTruthy();
  });

  it('does not show the template note when written is "model"', () => {
    render(<AlertList items={[base]} />);
    expect(screen.queryByText(/couldn’t verify its own wording/)).toBeNull();
  });

  it('shows the score chip, client and competitor', () => {
    render(<AlertList items={[base]} />);
    expect(screen.getByText('Score 82')).toBeTruthy();
    expect(screen.getByText('A1 HVAC')).toBeTruthy();
    expect(screen.getByText('Smith HVAC')).toBeTruthy();
    expect(screen.getByText('1 evidence items')).toBeTruthy();
  });

  it('shows the empty state when nothing is waiting', () => {
    render(<AlertList items={[]} />);
    expect(screen.getByText(/No alerts waiting/)).toBeTruthy();
  });

  // Final-review fix: the outcome stays visible after the revalidated queue no longer contains the card.
  it.each([
    ['immediate', 'Sent to the client.'],
    ['digest', 'Today’s limit of 3 alerts is reached — it goes out in the 17:00 digest.'],
    ['withdrawn', 'Withdrawn — its evidence was retracted, so nothing was sent.'],
  ])('keeps the %s approve outcome after the card leaves the list', async (_outcome, message) => {
    approveMock.mockResolvedValueOnce({ ok: true, message });
    const { rerender } = render(<AlertList items={[base]} />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    await waitFor(() => expect(approveMock).toHaveBeenCalledTimes(1));
    expect((approveMock.mock.calls[0]![1] as FormData).get('alertId')).toBe('a1');
    rerender(<AlertList items={[]} />);
    await waitFor(() => expect(screen.getByText(message)).toBeTruthy());
    expect(screen.getByText(/No alerts waiting/)).toBeTruthy();
  });

  it('keeps the dismiss message after the card leaves the list', async () => {
    dismissMock.mockResolvedValueOnce({ ok: true, message: 'Dismissed.' });
    const { rerender } = render(<AlertList items={[base]} />);
    fireEvent.click(screen.getByRole('button', { name: /^dismiss$/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Not relevant' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^dismiss$/i }));
    await waitFor(() => expect(dismissMock).toHaveBeenCalledTimes(1));
    rerender(<AlertList items={[]} />);
    await waitFor(() => expect(screen.getByText('Dismissed.')).toBeTruthy());
  });

  it('shows an approve refusal above the list', async () => {
    approveMock.mockResolvedValueOnce({ ok: false, error: 'Not found' });
    render(<AlertList items={[base]} />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Not found'));
  });
});
