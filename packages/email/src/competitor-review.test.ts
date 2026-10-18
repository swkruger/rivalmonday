import { describe, expect, it } from 'vitest';
import { resolveBranding } from './branding';
import { renderEmail } from './render';

const branding = resolveBranding('Acme Agency', { displayName: 'Acme Comfort', primary: '#112233', logoUrl: undefined });
const reviewUrl = 'https://app.test/sign-in?email=a%40b.com&next=%2Fc%2F1%2Fsetup';

describe('competitor_review email', () => {
  it('renders binding copy, list as lines in text and bullets in html', async () => {
    const out = await renderEmail({ template: 'competitor_review', props: { branding, businessName: 'Smith HVAC', competitorNames: ['Cool Air', 'Frosty Co'], reviewUrl } });
    expect(out.subject).toBe('Review the competitors we found for Smith HVAC');
    expect(out.text).toContain('We found these businesses competing with you:');
    expect(out.text).toContain('Tick the ones you want us to watch and untick any that');
    expect(out.text).toMatch(/- Cool Air/);
    expect(out.text).toMatch(/- Frosty Co/);
    expect(out.text).toContain('Review competitors');
    expect(out.html).toMatch(/<li[^>]*>Cool Air<\/li>/);
    expect(out.html).toContain('href="https://app.test/sign-in?email=a%40b.com&amp;next=%2Fc%2F1%2Fsetup"');
  });

  it('no template output contains "Rival Monday"', async () => {
    const out = await renderEmail({ template: 'competitor_review', props: { branding, businessName: 'Smith HVAC', competitorNames: ['Cool Air'], reviewUrl } });
    for (const s of [out.subject, out.html, out.text]) expect(s).not.toMatch(/rival\s*monday/i);
  });

  it('competitor list is capped at 5 and escaped', async () => {
    const names = ['<b>One</b>', 'Two & Co', 'Three', 'Four', 'Five', 'Six', 'Seven'];
    const out = await renderEmail({ template: 'competitor_review', props: { branding, businessName: 'Smith HVAC', competitorNames: names, reviewUrl } });
    expect(out.html).not.toContain('<b>One</b>');
    expect(out.html).toContain('&lt;b&gt;One&lt;/b&gt;');
    expect(out.html).toContain('Two &amp; Co');
    expect(out.html).toContain('Five');
    expect(out.html).not.toContain('Six');
    expect(out.text).not.toContain('Six');
    expect(out.text).not.toContain('Seven');
  });
});
