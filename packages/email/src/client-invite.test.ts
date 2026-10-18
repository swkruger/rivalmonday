import { describe, expect, it } from 'vitest';
import { resolveBranding } from './branding';
import { renderEmail } from './render';

const branding = resolveBranding('Acme Agency', { displayName: 'Acme Comfort', primary: '#112233', logoUrl: 'https://acme.test/logo.png' });
const startUrl = 'https://app.test/sign-in?email=a%40b.com&next=%2Fc%2F1%2Fsetup';

describe('client_invite email', () => {
  it('renders binding copy, agency branding and the start button', async () => {
    const out = await renderEmail({ template: 'client_invite', props: { branding, businessName: 'Smith HVAC', agencyName: 'Acme Comfort', startUrl } });
    expect(out.subject).toBe('Acme Comfort invited you to see your competitors');
    expect(out.text).toContain("Acme Comfort is setting up weekly competitor reports for Smith HVAC. Sign in to see who you're up against and what they're changing.");
    expect(out.text).toContain('Get started');
    expect(out.html).toContain('href="https://app.test/sign-in?email=a%40b.com&amp;next=%2Fc%2F1%2Fsetup"');
    expect(out.html).toContain('#112233');
    expect(out.html).toContain('alt="Acme Comfort"');
  });

  it('no template output contains "Rival Monday"', async () => {
    const out = await renderEmail({ template: 'client_invite', props: { branding: resolveBranding('Acme Agency', null), businessName: 'Smith HVAC', agencyName: 'Acme Agency', startUrl } });
    for (const s of [out.subject, out.html, out.text]) expect(s).not.toMatch(/rival\s*monday/i);
  });
});
