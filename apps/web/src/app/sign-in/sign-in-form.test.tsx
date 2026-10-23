// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const magicLink = vi.fn(async (): Promise<{ data: { status: boolean } | null; error: { message: string } | null }> => ({ data: { status: true }, error: null }));
const social = vi.fn(async () => ({ data: null, error: null }));
vi.mock('@/lib/auth-client', () => ({ authClient: { signIn: { magicLink, social } } }));

const remember = vi.fn(async () => undefined);
vi.mock('./check-email/actions', () => ({ rememberPendingEmail: remember }));

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const { SignInForm } = await import('./sign-in-form');

beforeEach(() => vi.clearAllMocks());

describe('SignInForm', () => {
  it('requests a magic link with the safe next path and goes to check-email', async () => {
    render(<SignInForm next="/inbox" googleEnabled={false} error={null} />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'pat@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /email me a sign-in link/i }));
    await waitFor(() =>
      expect(magicLink).toHaveBeenCalledWith({ email: 'pat@example.com', callbackURL: '/inbox', errorCallbackURL: '/sign-in?reason=link' }),
    );
    expect(push).toHaveBeenCalledWith('/sign-in/check-email');
    expect(remember).toHaveBeenCalledWith('pat@example.com', '/inbox');
  });

  it('a failing remember step still goes to check-email', async () => {
    remember.mockRejectedValueOnce(new Error('cookie'));
    render(<SignInForm next="/" googleEnabled={false} error={null} />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'pat@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /email me a sign-in link/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/sign-in/check-email'));
  });

  it('15a §2.10: a client next path rides along to check-email and the error pages (they brand by its agency)', async () => {
    const next = '/c/1/briefs/2';
    const q = `next=${encodeURIComponent(next)}`;
    const { rerender } = render(<SignInForm next={next} googleEnabled={false} error={null} />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'pat@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /email me a sign-in link/i }));
    await waitFor(() => expect(magicLink).toHaveBeenCalledWith({ email: 'pat@example.com', callbackURL: next, errorCallbackURL: `/sign-in?reason=link&${q}` }));
    expect(push).toHaveBeenCalledWith(`/sign-in/check-email?${q}`);
    rerender(<SignInForm next={next} googleEnabled error={null} />);
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    await waitFor(() => expect(social).toHaveBeenCalledWith({ provider: 'google', callbackURL: next, errorCallbackURL: `/sign-in?reason=google&${q}` }));
  });

  it('shows Google only when enabled and passes the next path', async () => {
    const { rerender } = render(<SignInForm next="/" googleEnabled={false} error={null} />);
    expect(screen.queryByRole('button', { name: /google/i })).toBeNull();
    rerender(<SignInForm next="/inbox" googleEnabled error={null} />);
    fireEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    await waitFor(() => expect(social).toHaveBeenCalledWith({ provider: 'google', callbackURL: '/inbox', errorCallbackURL: '/sign-in?reason=google' }));
  });

  it('explains an expired or used link', () => {
    render(<SignInForm next="/" googleEnabled={false} error="link" />);
    expect(screen.getByRole('alert').textContent).toMatch(/expired or was already used/i);
  });

  it('shows a generic message for an unknown error reason', () => {
    render(<SignInForm next="/" googleEnabled={false} error="something-else" />);
    expect(screen.getByRole('alert').textContent).toMatch(/sign-in failed/i);
  });

  it('shows a failure message without navigating when the send fails', async () => {
    magicLink.mockResolvedValueOnce({ data: null, error: { message: 'nope' } });
    render(<SignInForm next="/" googleEnabled={false} error={null} />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'pat@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /email me a sign-in link/i }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/could not send/i));
    expect(push).not.toHaveBeenCalled();
    expect(remember).not.toHaveBeenCalled();
  });

  it('prefills a valid email param and ignores an invalid one', () => {
    const { unmount } = render(<SignInForm next="/" googleEnabled={false} error={null} emailHint="owner@example.com" />);
    expect((screen.getByLabelText(/email/i) as HTMLInputElement).value).toBe('owner@example.com');
    unmount();
    render(<SignInForm next="/" googleEnabled={false} error={null} emailHint="not an email<script>" />);
    expect((screen.getByLabelText(/email/i) as HTMLInputElement).value).toBe('');
  });
});
