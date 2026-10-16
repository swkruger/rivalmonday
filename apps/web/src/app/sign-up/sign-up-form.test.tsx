// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./actions', () => ({ startSignup: vi.fn() }));
vi.mock('next/script', () => ({ default: ({ src }: { src: string }) => <i data-testid="script" data-src={src} /> }));

const { SignUpForm } = await import('./sign-up-form');
afterEach(cleanup);

describe('SignUpForm', () => {
  it('renders the fields and the create button; Google only when configured', () => {
    const { rerender } = render(<SignUpForm googleEnabled={false} siteKey={null} />);
    expect(screen.getByLabelText('Work email')).toBeTruthy();
    expect(screen.getByLabelText('Agency name')).toBeTruthy();
    expect(screen.getByLabelText('Your name (optional)')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create my agency' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /google/i })).toBeNull();
    rerender(<SignUpForm googleEnabled siteKey={null} />);
    const g = screen.getByRole('button', { name: 'Continue with Google' }) as HTMLButtonElement;
    expect(g.name).toBe('intent');
    expect(g.value).toBe('google');
  });

  it('loads the Turnstile script and widget only with a site key', () => {
    const { container, rerender } = render(<SignUpForm googleEnabled={false} siteKey={null} />);
    expect(screen.queryByTestId('script')).toBeNull();
    expect(container.querySelector('.cf-turnstile')).toBeNull();
    rerender(<SignUpForm googleEnabled={false} siteKey="site-key" />);
    expect(screen.getByTestId('script').getAttribute('data-src')).toBe('https://challenges.cloudflare.com/turnstile/v0/api.js');
    expect(container.querySelector('.cf-turnstile')?.getAttribute('data-sitekey')).toBe('site-key');
  });

  it('a locked invite email is pre-filled and read-only; the token rides in a hidden field', () => {
    const { container } = render(<SignUpForm googleEnabled={false} siteKey={null} inviteToken="rm_inv_abc" lockedEmail="pat@acme.com" />);
    const email = screen.getByLabelText('Work email') as HTMLInputElement;
    expect(email.value).toBe('pat@acme.com');
    expect(email.readOnly).toBe(true);
    expect((container.querySelector('input[name="inviteToken"]') as HTMLInputElement).value).toBe('rm_inv_abc');
  });

  it('an unlocked email is editable; a Better Auth failure reason shows a message', () => {
    render(<SignUpForm googleEnabled={false} siteKey={null} reason="link" />);
    expect((screen.getByLabelText('Work email') as HTMLInputElement).readOnly).toBe(false);
    expect(screen.getByRole('alert').textContent).toMatch(/expired or was already used/i);
  });
});
