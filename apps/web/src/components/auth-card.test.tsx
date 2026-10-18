// @vitest-environment jsdom
import { resolveBranding } from '@cs/email';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthCard } from './auth-card';

afterEach(cleanup);
const LEAK = /rival[\s-]*monday/i;

describe('AuthCard', () => {
  it('branding null: a neutral card, no wordmark, no logo, no product name (15a §2.10)', () => {
    const { container } = render(<AuthCard branding={null} title="Sign in"><p>body</p></AuthCard>);
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.textContent).not.toMatch(LEAK);
    expect(container.innerHTML).not.toMatch(LEAK);
    expect(container.querySelector('main')?.getAttribute('style')).toBeNull();
  });

  it("an agency's branding: its name as the wordmark and its colours on the card's page", () => {
    const { container } = render(<AuthCard branding={resolveBranding('Acme', { displayName: 'Cool Comfort', primary: '#112233' })} title="Sign in"><p>body</p></AuthCard>);
    expect(screen.getByText('Cool Comfort')).toBeTruthy();
    expect(container.textContent).not.toMatch(LEAK);
    expect((container.querySelector('main') as HTMLElement).style.getPropertyValue('--primary')).toBe('#112233');
  });

  it("an agency logo replaces the wordmark", () => {
    render(<AuthCard branding={resolveBranding('Acme', { logoUrl: 'https://acme.example/logo.png' })} title="Sign in"><p>body</p></AuthCard>);
    expect(screen.getByRole('img', { name: 'Acme' }).getAttribute('src')).toBe('https://acme.example/logo.png');
  });

  it('the Rival Monday default (agency-facing pages: sign-up, join) keeps the product wordmark', () => {
    const { container } = render(<AuthCard branding={resolveBranding('Rival Monday', null)} title="Start your trial"><p>body</p></AuthCard>);
    expect(container.textContent).toContain('rivalmonday');
  });
});
