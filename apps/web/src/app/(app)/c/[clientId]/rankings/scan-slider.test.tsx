// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

import { SCAN_COMMIT_MS, ScanSlider } from './scan-slider';

const scans = [{ id: 's1', label: 'Sep 17, 2026' }, { id: 's2', label: 'Sep 24, 2026' }, { id: 's3', label: 'Oct 1, 2026' }];
const query = { keyword: 'ac repair' };

describe('ScanSlider', () => {
  beforeEach(() => { replace.mockReset(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('keeps its DOM node and focus across a re-render with a new value', () => {
    const { rerender } = render(<ScanSlider scans={scans} value="s3" query={query} />);
    const input = screen.getByRole('slider', { name: 'Scan' }) as HTMLInputElement;
    input.focus();
    fireEvent.change(input, { target: { value: '1' } });
    act(() => { vi.advanceTimersByTime(SCAN_COMMIT_MS); });
    rerender(<ScanSlider scans={scans} value="s2" query={query} />);
    const after = screen.getByRole('slider', { name: 'Scan' }) as HTMLInputElement;
    expect(after).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(after.value).toBe('1');
    // A new value from elsewhere re-syncs the position.
    rerender(<ScanSlider scans={scans} value="s1" query={query} />);
    expect(after.value).toBe('0');
    expect(screen.getByText('Sep 17, 2026')).toBeTruthy();
  });

  it('navigates once when the value settles, not on every step', () => {
    render(<ScanSlider scans={scans} value="s3" query={query} />);
    const input = screen.getByRole('slider', { name: 'Scan' });
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(input, { target: { value: '0' } });
    expect(replace).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(SCAN_COMMIT_MS); });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('?keyword=ac+repair&scan=s1', { scroll: false });
  });

  it('does not navigate when it settles back on the current scan', () => {
    render(<ScanSlider scans={scans} value="s3" query={query} />);
    const input = screen.getByRole('slider', { name: 'Scan' });
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.change(input, { target: { value: '2' } });
    act(() => { vi.advanceTimersByTime(SCAN_COMMIT_MS); });
    expect(replace).not.toHaveBeenCalled();
  });
});
