// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FormResult } from '@/server/forms';
import { TopicQueue } from './topic-queue';

afterEach(cleanup);
/** A fixed clock: the age and the year shown depend on it. */
const NOW = Date.parse('2026-10-09T00:00:00.000Z');

const p = { id: 'p1', verticalId: 'hvac_plumbing', verticalName: 'HVAC & Plumbing', topicId: 'hidden_fees', name: 'Hidden fees', description: 'Unexpected fees', status: 'proposed' as const, otherCount: 14, createdAt: '2026-10-07T00:00:00.000Z', decidedAt: null, samples: ['They charged a trip fee.'] };
// Typed with (prev, fd) params (unused) so `action.mock.calls[0]![1]` below is typed as FormData, matching `TopicQueue`'s action prop.
const mk = () => vi.fn(async (_prev: FormResult, _fd: FormData) => ({ ok: true as const, message: 'Approved “Hidden fees”.' }));

describe('TopicQueue', () => {
  it('approve needs a confirm, then keeps the message after the proposal moves to the decided list', async () => {
    const action = mk();
    const { rerender } = render(<TopicQueue pending={[p]} decided={[]} action={action} tz="UTC" nowMs={NOW} />);
    expect(screen.getByText('They charged a trip fee.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve Hidden fees' }));
    expect(action).not.toHaveBeenCalled();
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.getByText('Approved “Hidden fees”.')).toBeTruthy());
    const fd = action.mock.calls[0]![1] as FormData;
    expect([fd.get('proposalId'), fd.get('decision'), fd.get('name')]).toEqual(['p1', 'approved', 'Hidden fees']);
    rerender(<TopicQueue pending={[]} decided={[{ ...p, status: 'approved', decidedAt: '2026-10-07T01:00:00.000Z' }]} action={action} tz="UTC" nowMs={NOW} />);
    expect(screen.getByText('Approved “Hidden fees”.')).toBeTruthy();
  });

  it('reject needs a confirm too', async () => {
    const action = mk();
    render(<TopicQueue pending={[p]} decided={[]} action={action} tz="UTC" nowMs={NOW} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reject Hidden fees' }));
    expect(action).not.toHaveBeenCalled();
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect((action.mock.calls[0]![1] as FormData).get('decision')).toBe('rejected');
  });

  it('status is a chip with a label', () => {
    render(<TopicQueue pending={[p]} decided={[{ ...p, id: 'p2', name: 'Late arrival', status: 'rejected', decidedAt: '2026-10-07T01:00:00.000Z' }]} action={mk()} tz="UTC" nowMs={NOW} />);
    expect(screen.getByText('Waiting for review')).toBeTruthy();
    expect(screen.getByText('Rejected')).toBeTruthy();
    expect(screen.queryByText('rejected')).toBeNull();
  });

  it('no ISO dates', () => {
    const { container } = render(<TopicQueue pending={[p]} decided={[{ ...p, id: 'p2', status: 'approved', decidedAt: '2026-10-07T01:00:00.000Z' }]} action={mk()} tz="UTC" nowMs={NOW} />);
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(screen.getByText('Oct 7')).toBeTruthy();
    expect(container.textContent).toContain('Proposed 2 days ago');
  });

  it('a decision from another year shows the year', () => {
    render(<TopicQueue pending={[]} decided={[{ ...p, id: 'p2', status: 'approved', decidedAt: '2025-10-07T01:00:00.000Z' }]} action={mk()} tz="UTC" nowMs={NOW} />);
    expect(screen.getByText('Oct 7, 2025')).toBeTruthy();
  });
});
