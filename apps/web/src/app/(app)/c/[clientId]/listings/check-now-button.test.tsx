// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadOnlyProvider } from '@/components/read-only';
import type { CheckInfo } from './check-copy';

const requestListingsCheck = vi.fn();
vi.mock('./actions', () => ({ requestListingsCheck: (...a: unknown[]) => requestListingsCheck(...a) }));
const { CheckNowButton } = await import('./check-now-button');

const info = (state: CheckInfo['state'], label: string | null = null): CheckInfo => ({ state, label });
beforeEach(() => requestListingsCheck.mockReset());
afterEach(cleanup);

describe('CheckNowButton', () => {
  it('renders each state', () => {
    render(<CheckNowButton clientId="c1" check={info('available')} />);
    expect((screen.getByRole('button', { name: 'Check listings now' }) as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    render(<CheckNowButton clientId="c1" check={info('weekly_limit', 'Next check available Tue 17 Nov')} />);
    expect((screen.getByRole('button', { name: 'Next check available Tue 17 Nov' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    render(<CheckNowButton clientId="c1" check={info('spend_paused', 'paused note')} />);
    const b = screen.getByRole('button', { name: 'Check listings now' });
    expect((b as HTMLButtonElement).disabled).toBe(true);
    expect(document.getElementById(b.getAttribute('aria-describedby')!)?.textContent).toBe('paused note');
    cleanup();
    render(<CheckNowButton clientId="c1" check={info('not_ready')} />);
    const nb = screen.getByRole('button', { name: 'Check listings now' }) as HTMLButtonElement;
    expect(nb.disabled).toBe(true);
    expect(document.getElementById(nb.getAttribute('aria-describedby')!)?.textContent).toBe('Add your Google listing and competitors first, then check listings.');
  });

  it('a revalidated state other than available wins over the queued latch', async () => {
    requestListingsCheck.mockResolvedValue({ ok: true, message: 'Check started. Results appear here in a few minutes.' });
    const { rerender } = render(<CheckNowButton clientId="c1" check={info('available')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check listings now' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check running…' })).toBeTruthy());
    rerender(<CheckNowButton clientId="c1" check={info('weekly_limit', 'Next check available Tue 17 Nov')} />);
    expect(screen.getByRole('button', { name: 'Next check available Tue 17 Nov' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check running…' })).toBeNull();
  });

  it('queues a check, then shows it running', async () => {
    requestListingsCheck.mockResolvedValue({ ok: true, message: 'Check started. Results appear here in a few minutes.' });
    render(<CheckNowButton clientId="c1" check={info('available')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check listings now' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Check started'));
    expect(requestListingsCheck).toHaveBeenCalledWith('c1');
    expect((screen.getByRole('button', { name: 'Check running…' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a refusal as an alert', async () => {
    requestListingsCheck.mockResolvedValue({ ok: false, error: 'Next check available Tue 17 Nov.' });
    render(<CheckNowButton clientId="c1" check={info('available')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Check listings now' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Next check available Tue 17 Nov.'));
  });

  it('is hidden in a read-only support session', () => {
    const { container } = render(<ReadOnlyProvider readOnly><CheckNowButton clientId="c1" check={info('available')} /></ReadOnlyProvider>);
    expect(container.innerHTML).toBe('');
  });
});
