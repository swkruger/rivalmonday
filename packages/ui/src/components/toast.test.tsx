// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './toast';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Trigger({ action }: { action?: { label: string; onClick: () => void } }) {
  const toast = useToast();
  return <button onClick={() => toast.show({ message: 'Saved', action })}>go</button>;
}

describe('Toast', () => {
  it('shows the message in a toast (radix announces it; the root has no role of its own)', async () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    fireEvent.click(screen.getByText('go'));
    const toast = (await screen.findAllByText('Saved')).map((el) => el.closest('[data-slot="toast"]')).find(Boolean);
    expect(toast).toBeTruthy();
    expect(toast!.getAttribute('role')).toBeNull();
  });

  it('renders an action button that calls onClick', async () => {
    const onClick = vi.fn();
    render(<ToastProvider><Trigger action={{ label: 'Undo', onClick }} /></ToastProvider>);
    fireEvent.click(screen.getByText('go'));
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses after 4000 ms', async () => {
    vi.useFakeTimers();
    render(<ToastProvider><Trigger /></ToastProvider>);
    fireEvent.click(screen.getByText('go'));
    expect(document.querySelector('[data-slot="toast"]')).not.toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(document.querySelector('[data-slot="toast"]')).toBeNull();
  });

  it('stays for 6000 ms when it has an action', async () => {
    vi.useFakeTimers();
    render(<ToastProvider><Trigger action={{ label: 'Undo', onClick: () => {} }} /></ToastProvider>);
    fireEvent.click(screen.getByText('go'));
    await act(async () => { await vi.advanceTimersByTimeAsync(5999); });
    expect(document.querySelector('[data-slot="toast"]')).not.toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(document.querySelector('[data-slot="toast"]')).toBeNull();
  });
});
