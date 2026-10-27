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
  it('shows a status message', async () => {
    render(<ToastProvider><Trigger /></ToastProvider>);
    fireEvent.click(screen.getByText('go'));
    const toast = await screen.findByText('Saved');
    expect(toast.closest('[role="status"]')).not.toBeNull();
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
    expect(screen.getByText('Saved').closest('[role="status"]')).not.toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(4100); });
    expect(screen.queryByText('Saved')).toBeNull();
  });
});
