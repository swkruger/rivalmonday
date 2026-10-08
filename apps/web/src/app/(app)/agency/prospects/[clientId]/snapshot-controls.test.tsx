// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const { SnapshotControls } = await import('./snapshot-controls');

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  vi.useRealTimers();
  refresh.mockReset();
});

describe('SnapshotControls', () => {
  it('lists what is missing and disables the button', () => {
    render(<SnapshotControls clientId="c1" report={null} canRun={false} blockers={['Pick at least one competitor']} action={vi.fn()} />);
    expect(screen.getByText('Pick at least one competitor')).toBeTruthy();
    expect((screen.getByRole('button', { name: /run snapshot/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('starts a snapshot and refreshes while it runs', async () => {
    const action = vi.fn(async () => ({ ok: true as const, message: 'Snapshot started.' }));
    const { rerender } = render(<SnapshotControls clientId="c1" report={null} canRun blockers={[]} action={action} />);
    fireEvent.click(screen.getByRole('button', { name: /run snapshot/i }));
    await waitFor(() => expect(screen.getByText('Snapshot started.')).toBeTruthy());
    rerender(<SnapshotControls clientId="c1" report={{ id: 'r1', status: 'running', createdAt: new Date().toISOString(), finishedAt: null, error: null, data: null }} canRun blockers={[]} action={action} />);
    expect(screen.getByText(/running/i)).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(refresh).toHaveBeenCalled();
  });

  it('shows a failed snapshot’s reason', () => {
    render(<SnapshotControls clientId="c1" report={{ id: 'r1', status: 'failed', createdAt: '2026-10-07T00:00:00.000Z', finishedAt: null, error: 'The snapshot timed out — run it again', data: null }} canRun blockers={[]} action={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toMatch(/timed out/);
  });
});
