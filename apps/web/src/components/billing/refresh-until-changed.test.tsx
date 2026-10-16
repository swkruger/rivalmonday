// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
const { RefreshUntilChanged, REFRESH_EVERY_MS, MAX_REFRESHES } = await import('./refresh-until-changed');

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('RefreshUntilChanged', () => {
  it('refreshes on an interval and renders nothing', () => {
    const { container } = render(<RefreshUntilChanged watch="trialing:false" />);
    expect(container.innerHTML).toBe('');
    expect(refresh).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(REFRESH_EVERY_MS * 3));
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('stops once the watched value differs from the one at mount', () => {
    const { rerender } = render(<RefreshUntilChanged watch="trialing:false" />);
    act(() => void vi.advanceTimersByTime(REFRESH_EVERY_MS));
    expect(refresh).toHaveBeenCalledTimes(1);
    rerender(<RefreshUntilChanged watch="active:true" />);
    act(() => void vi.advanceTimersByTime(REFRESH_EVERY_MS * 5));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('gives up after MAX_REFRESHES when nothing changes', () => {
    render(<RefreshUntilChanged watch="trialing:false" />);
    act(() => void vi.advanceTimersByTime(REFRESH_EVERY_MS * (MAX_REFRESHES + 10)));
    expect(refresh).toHaveBeenCalledTimes(MAX_REFRESHES);
  });

  it('stops on unmount', () => {
    const { unmount } = render(<RefreshUntilChanged watch="x" />);
    unmount();
    act(() => void vi.advanceTimersByTime(REFRESH_EVERY_MS * 5));
    expect(refresh).not.toHaveBeenCalled();
  });
});
