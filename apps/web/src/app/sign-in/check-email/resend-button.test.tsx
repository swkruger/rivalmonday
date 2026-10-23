// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const resend = vi.hoisted(() => vi.fn());
vi.mock('./actions', () => ({ resendEmailAction: resend }));
const { ResendButton } = await import('./resend-button');

const SENT = { status: 'sent', message: 'If that address can sign in, a new email is on its way.' };
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  resend.mockReset();
  resend.mockResolvedValue(SENT);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const button = () => screen.getByRole('button') as HTMLButtonElement;

describe('ResendButton', () => {
  it('renders enabled with an empty status line', () => {
    render(<ResendButton startAgainHref="/sign-in" />);
    expect(button().textContent).toBe('Resend email');
    expect(button().disabled).toBe(false);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('counts down 60 s after submit', async () => {
    render(<ResendButton startAgainHref="/sign-in" />);
    fireEvent.click(button());
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(SENT.message));
    expect(resend).toHaveBeenCalledTimes(1);
    expect(button().disabled).toBe(true);
    expect(button().textContent).toMatch(/^Resend in (60|59) s$/);
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(button().textContent).toMatch(/^Resend in (30|29) s$/);
    await act(async () => { vi.advanceTimersByTime(31_000); });
    expect(button().disabled).toBe(false);
    expect(button().textContent).toBe('Resend email');
  });

  it('an expired cookie turns the button into a "Start again" link', async () => {
    resend.mockResolvedValue({ status: 'expired', message: null });
    render(<ResendButton startAgainHref="/sign-up" />);
    fireEvent.click(button());
    const link = await screen.findByRole('link', { name: 'Start again' });
    expect(link.getAttribute('href')).toBe('/sign-up');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
