// @vitest-environment jsdom
import { resolveBranding } from '@cs/email';
import { bandColor } from '@cs/ui';
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

  it('D7: an agency page gets a thin top strip in the band colour, flush at the top of <main>', () => {
    const branding = resolveBranding('Acme', { displayName: 'Cool Comfort', primary: '#112233' });
    const { container } = render(<AuthCard branding={branding} title="Sign in"><p>body</p></AuthCard>);
    const main = container.querySelector('main') as HTMLElement;
    const strip = container.querySelector('[data-slot="auth-strip"]') as HTMLElement | null;
    expect(strip).not.toBeNull();
    expect(strip?.getAttribute('aria-hidden')).toBe('true');
    expect(strip?.className).toContain('bg-brand-ink');
    expect(main.firstElementChild).toBe(strip);
    expect(main.style.getPropertyValue('--brand-ink')).toBe(bandColor(branding));
  });

  it('D7: no strip on the neutral card or the Rival Monday default', () => {
    const neutral = render(<AuthCard branding={null} title="Sign in"><p>body</p></AuthCard>);
    expect(neutral.container.querySelector('[data-slot="auth-strip"]')).toBeNull();
    neutral.unmount();
    const rm = render(<AuthCard branding={resolveBranding('Rival Monday', null)} title="Start your trial"><p>body</p></AuthCard>);
    expect(rm.container.querySelector('[data-slot="auth-strip"]')).toBeNull();
  });

  it("an agency logo replaces the wordmark", () => {
    render(<AuthCard branding={resolveBranding('Acme', { logoUrl: 'https://acme.example/logo.png' })} title="Sign in"><p>body</p></AuthCard>);
    expect(screen.getByRole('img', { name: 'Acme' }).getAttribute('src')).toBe('https://acme.example/logo.png');
  });

  it('the Rival Monday default (agency-facing pages: sign-up, join) keeps the product wordmark', () => {
    const { container } = render(<AuthCard branding={resolveBranding('Rival Monday', null)} title="Start your trial"><p>body</p></AuthCard>);
    expect(container.textContent).toContain('rivalmonday');
  });

  it('D-22: a plain 400 px column, not a card; exactly one h1 with the title', () => {
    const { container } = render(<AuthCard branding={null} title="Sign in"><p>body</p></AuthCard>);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(container.querySelector('[data-slot="card"]')).toBeNull();
    expect(container.querySelector('main[data-slot="auth-column"]')).not.toBeNull();
  });
});
