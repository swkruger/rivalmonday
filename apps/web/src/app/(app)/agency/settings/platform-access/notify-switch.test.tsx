// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const setSupportNotifyAction = vi.fn();
vi.mock('./actions', () => ({ setSupportNotifyAction: (...a: unknown[]) => setSupportNotifyAction(...a) }));
const { NotifySwitch, NOTIFY_LABEL } = await import('./notify-switch');

afterEach(() => { cleanup(); setSupportNotifyAction.mockReset(); });

describe('NotifySwitch', () => {
  it('notify switch reverts and shows the error when runTool fails', async () => {
    setSupportNotifyAction.mockResolvedValue({ ok: false, error: "We couldn't save that. Try again." });
    render(<NotifySwitch enabled={false} />);
    const sw = screen.getByRole('switch', { name: NOTIFY_LABEL });
    expect(sw.getAttribute('aria-checked')).toBe('false');
    await act(async () => { fireEvent.click(sw); });
    expect(setSupportNotifyAction).toHaveBeenCalledWith(true);
    expect(screen.getByRole('alert').textContent).toContain("We couldn't save that");
    expect(screen.getByRole('switch', { name: NOTIFY_LABEL }).getAttribute('aria-checked')).toBe('false');
  });

  it('keeps the new value and shows no error when the save works', async () => {
    setSupportNotifyAction.mockResolvedValue({ ok: true });
    render(<NotifySwitch enabled={false} />);
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: NOTIFY_LABEL })); });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
