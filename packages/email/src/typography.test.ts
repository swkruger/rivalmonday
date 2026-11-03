import { describe, expect, it } from 'vitest';
import { contrastRatio, readableTextOn, resolveBranding } from './branding';
import { EMAIL_PREVIEWS } from './previews';
import { renderEmail } from './render';

/** Owner, 2026-11-02: email text was too small. Body 16 px, nothing under 14 px, button label 16 px and readable on the brand colour. */
const sizes = (html: string) => [...html.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]));

describe('email typography', () => {
  it('body text is 16 px with a 24 px line height', async () => {
    const out = await renderEmail({ template: 'agency_invite', props: { branding: resolveBranding('Rival Monday', null), url: 'https://x.test/j', offer: 'pilot', expiresAt: '2026-11-17' } });
    const p = out.html.match(/<p[^>]*>This invitation is from the Rival Monday team\.<\/p>/)?.[0] ?? '';
    expect(p).toMatch(/font-size:16px/);
    expect(p).toMatch(/line-height:24px/);
  });

  it.each(EMAIL_PREVIEWS.map((p) => [p.id, p] as const))('%s: no text under 14 px', async (_id, p) => {
    const out = await renderEmail(p.payload);
    expect(Math.min(...sizes(out.html))).toBeGreaterThanOrEqual(14);
  });

  it('button label is 16 px and readable on the default primary (ink on #47A8E7)', async () => {
    const out = await renderEmail({ template: 'agency_invite', props: { branding: resolveBranding('Rival Monday', null), url: 'https://x.test/j', offer: 'pilot', expiresAt: '2026-11-17' } });
    const a = out.html.match(/<a[^>]*href="https:\/\/x\.test\/j"[^>]*>/)?.[0] ?? '';
    expect(a).toMatch(/font-size:16px/);
    expect(a.toLowerCase()).toMatch(/color:#0b2540/);
  });

  it('button label is white on a dark agency primary', async () => {
    const branding = resolveBranding('Acme', { primary: '#1D3557' });
    const out = await renderEmail({ template: 'agency_invite', props: { branding, url: 'https://x.test/j', offer: 'pilot', expiresAt: '2026-11-17' } });
    const a = out.html.match(/<a[^>]*href="https:\/\/x\.test\/j"[^>]*>/)?.[0] ?? '';
    expect(a.toLowerCase()).toMatch(/color:#ffffff/);
  });

  it('readableTextOn picks the higher-contrast label', () => {
    expect(readableTextOn('#47A8E7')).toBe('#0B2540');
    expect(readableTextOn('#000000')).toBe('#FFFFFF');
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
  });
});
