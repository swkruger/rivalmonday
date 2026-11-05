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
    expect(screen.getByLabelText(/^Work email/)).toBeTruthy();
    expect(screen.getByLabelText(/^Agency name/)).toBeTruthy();
    expect(screen.queryByLabelText(/Your name/)).toBeNull();
    expect(document.querySelector('label[for="email"]')!.textContent).toContain('(required)');
    expect(screen.getByRole('button', { name: 'Create my agency' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /google/i })).toBeNull();
    rerender(<SignUpForm googleEnabled siteKey={null} />);
    const g = screen.getByRole('button', { name: 'Continue with Google' }) as HTMLButtonElement;
    expect(g.name).toBe('intent');
    expect(g.value).toBe('google');
  });

  it('asks the D9 fence questions with the decided copy and the fine print', () => {
    render(<SignUpForm googleEnabled={false} siteKey={null} />);
    const site = screen.getByLabelText(/^Your agency's website/) as HTMLInputElement;
    expect(site.name).toBe('website');
    expect(document.querySelector('label[for="website"]')!.textContent).toBe("Your agency's website(optional)");
    const served = screen.getByLabelText(/^How many clients do you look after today\?/) as HTMLSelectElement;
    expect(served.name).toBe('clientsServed');
    expect(served.required).toBe(true);
    const opts = [...served.options].filter((o) => o.value !== '');
    expect(opts.map((o) => [o.value, o.textContent])).toEqual([['0', 'None yet'], ['1-5', '1–5'], ['6-20', '6–20'], ['21+', '21 or more']]);
    expect(served.value).toBe('');
    expect(screen.getByText("Rival Monday's agency plan is for businesses that market other businesses.")).toBeTruthy();
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
    const email = screen.getByLabelText(/^Work email/) as HTMLInputElement;
    expect(email.value).toBe('pat@acme.com');
    expect(email.readOnly).toBe(true);
    expect((container.querySelector('input[name="inviteToken"]') as HTMLInputElement).value).toBe('rm_inv_abc');
  });

  it('an unlocked email is editable; a Better Auth failure reason shows a message', () => {
    render(<SignUpForm googleEnabled={false} siteKey={null} reason="link" />);
    expect((screen.getByLabelText(/^Work email/) as HTMLInputElement).readOnly).toBe(false);
    expect(screen.getByRole('alert').textContent).toMatch(/expired or was already used/i);
  });
});
