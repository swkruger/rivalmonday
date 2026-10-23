import { describe, expect, it } from 'vitest';
import { resolveBranding } from './branding';
import { renderEmail } from './render';

const branding = resolveBranding('Acme Agency', { displayName: 'Acme Comfort', primary: '#112233', logoUrl: 'https://acme.test/logo.png' });
const signInUrl = 'https://app.test/sign-in?email=a%40b.com&next=%2Fagency';
const props = { branding, inviterName: 'Pat Lee', agencyName: 'Acme Comfort', roleLabel: 'Account manager', expiryDate: 'Nov 6, 2026', signInUrl };

describe('team_invite email (15c-2a D7)', () => {
  it('subject and body match the decided copy', async () => {
    const out = await renderEmail({ template: 'team_invite', props });
    expect(out.subject).toBe('Pat Lee invited you to Acme Comfort');
    expect(out.text).toContain('Pat Lee has invited you to join Acme Comfort as Account manager. Sign in with this email address to accept. This invite expires on Nov 6, 2026.');
    expect(out.text).toContain('Sign in');
    expect(out.html).toContain('href="https://app.test/sign-in?email=a%40b.com&amp;next=%2Fagency"');
    expect(out.html).toContain('#112233');
    expect(out.html).toContain('alt="Acme Comfort"');
  });

  it('team_invite email has no Rival Monday for a branded agency', async () => {
    const out = await renderEmail({ template: 'team_invite', props: { ...props, branding: resolveBranding('Acme Agency', { displayName: 'Cool Comfort' }), agencyName: 'Cool Comfort' } });
    for (const s of [out.subject, out.html, out.text]) expect(s).not.toMatch(/rival[\s-]*monday/i);
  });
});
