import { describe, expect, it } from 'vitest';
import { resolveBranding } from './branding';
import { renderEmail } from './render';

describe('sign_in email', () => {
  it('renders a branded single-link email with plain-text fallback', async () => {
    const branding = resolveBranding('Acme Marketing', { primary: '#123ABC' });
    const url = 'https://rm.nofingers.ai/api/auth/magic-link/verify?token=abc&callbackURL=%2F';
    const out = await renderEmail({ template: 'sign_in', props: { branding, url, expiresMinutes: 15 } });
    expect(out.subject).toBe('Your sign-in link for Acme Marketing');
    expect(out.html).toContain(url.replace(/&/g, '&amp;'));
    expect(out.html).toContain('#123ABC');
    expect(out.text).toContain(url);
    expect(out.text).toMatch(/15 minutes/);
    expect(out.text).toMatch(/didn.t ask/i);
  });

  it('renders the sign-up wording when a pending agency is given', async () => {
    const branding = resolveBranding('Rival Monday', null);
    const url = 'https://rm.nofingers.ai/api/auth/magic-link/verify?token=abc';
    const out = await renderEmail({ template: 'sign_in', props: { branding, url, expiresMinutes: 15, signup: { agencyName: 'Acme HVAC' } } });
    expect(out.subject).toBe('Confirm your email to create Acme HVAC');
    expect(out.text).toContain('Click below to confirm your email and set up Acme HVAC on Rival Monday.');
    expect(out.text).toContain('Confirm and continue');
    expect(out.text).toContain(url);
    expect(out.text).not.toContain('Use the button below to sign in');
  });
});
