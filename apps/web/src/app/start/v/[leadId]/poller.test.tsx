// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const { PreviewPoller } = await import('./poller');

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('PreviewPoller', () => {
  it('refreshes every 3 s, stops at 2 minutes and switches to the email copy', () => {
    render(<PreviewPoller />);
    expect(screen.getByRole('status').textContent).toBe('Building your snapshot…');
    act(() => { vi.advanceTimersByTime(2_999); });
    expect(refresh).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(refresh).toHaveBeenCalledTimes(1);
    act(() => { vi.advanceTimersByTime(117_000); }); // t = 120 s
    const calls = refresh.mock.calls.length;
    expect(calls).toBe(39); // 3 s … 117 s; the 120 s tick gives up instead
    expect(screen.getByRole('status').textContent).toBe("Your snapshot is taking longer than usual — we'll email it to you.");
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(refresh).toHaveBeenCalledTimes(calls);
  });
});
