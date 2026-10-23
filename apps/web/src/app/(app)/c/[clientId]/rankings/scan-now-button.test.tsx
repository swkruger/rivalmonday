// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadOnlyProvider } from '@/components/read-only';
import type { RankScanInfo } from './scan-copy';

const requestRankScan = vi.fn();
vi.mock('./actions', () => ({ requestRankScan: (...a: unknown[]) => requestRankScan(...a), saveRankSettings: vi.fn() }));
const { ScanNowButton } = await import('./scan-now-button');

const scan = (state: RankScanInfo['state'], label: string | null = null): RankScanInfo => ({ state, nextAvailableAt: null, label });
const CAP = "Cool Air is close to this month's credit limit, so this scan can't run until next month.";
const DAILY = "Your agency has used today's 10 manual scans.";

beforeEach(() => requestRankScan.mockReset());
afterEach(cleanup);

describe('ScanNowButton', () => {
  it('button renders each state\'s copy', () => {
    const button = () => screen.getByRole('button', { name: /scan|next/i }) as HTMLButtonElement;

    render(<ScanNowButton clientId="c1" scan={scan('available')} />);
    expect(button().textContent).toBe('Scan now');
    expect(button().disabled).toBe(false);
    cleanup();

    render(<ScanNowButton clientId="c1" scan={scan('weekly_limit', 'Next scan available Wed 21 Oct')} />);
    expect(button().textContent).toBe('Next scan available Wed 21 Oct');
    expect(button().disabled).toBe(true);
    cleanup();

    render(<ScanNowButton clientId="c1" scan={scan('agency_daily_limit', DAILY)} />);
    expect(button().disabled).toBe(true);
    expect(screen.getByText(DAILY)).toBeTruthy();
    cleanup();

    render(<ScanNowButton clientId="c1" scan={scan('cap', CAP)} />);
    expect(button().disabled).toBe(true);
    expect(screen.getByText(CAP)).toBeTruthy();
    cleanup();

    render(<ScanNowButton clientId="c1" scan={scan('running', 'Scan running…')} />);
    expect(button().textContent).toBe('Scan running…');
    expect(button().disabled).toBe(true);
    cleanup();

    const { container } = render(<ScanNowButton clientId="c1" scan={scan('not_ready')} />);
    expect(container.innerHTML).toBe('');
  });

  it('queues a scan, then shows it running with the ETA message', async () => {
    requestRankScan.mockResolvedValue({ ok: true, message: 'Scan queued — results in about 4 minutes.' });
    render(<ScanNowButton clientId="c1" scan={scan('available')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Scan now' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Scan queued — results in about 4 minutes.'));
    expect(requestRankScan).toHaveBeenCalledWith('c1');
    const b = screen.getByRole('button', { name: 'Scan running…' }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
  });

  it('shows a refusal as an alert and keeps the button', async () => {
    requestRankScan.mockResolvedValue({ ok: false, error: 'Next manual scan available Wed 21 Oct.' });
    render(<ScanNowButton clientId="c1" scan={scan('available')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Scan now' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Next manual scan available Wed 21 Oct.'));
  });

  it('is hidden in a read-only support session', () => {
    const { container } = render(<ReadOnlyProvider readOnly><ScanNowButton clientId="c1" scan={scan('available')} /></ReadOnlyProvider>);
    expect(container.innerHTML).toBe('');
  });
});
