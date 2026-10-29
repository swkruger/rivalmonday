import { describe, expect, it } from 'vitest';
import { resolveBranding } from './branding';
import { renderEmail } from './render';

const platform = resolveBranding('Rival Monday', null);
const props = { branding: platform, contactName: 'Ada', orgName: 'Agency Co', confirmUrl: 'https://app.test/waitlist/confirm/RAW', sampleBusinessName: null };

describe('waitlist_confirmation', () => {
  it('agency variant mentions the sample only when requested', async () => {
    const without = await renderEmail({ template: 'waitlist_confirmation', props: { ...props, kind: 'agency' } });
    expect(without.subject).toBe('Confirm your place in the Rival Monday pilot');
    expect(without.text).toContain('Hi Ada, thanks for asking to join the Rival Monday pilot for Agency Co.');
    expect(without.text).toContain('Confirm my email');
    expect(without.text).toContain('https://app.test/waitlist/confirm/RAW');
    expect(without.text).toContain('The link works for 7 days.');
    expect(without.text).not.toContain('sample brief');
    const withSample = await renderEmail({ template: 'waitlist_confirmation', props: { ...props, kind: 'agency', sampleBusinessName: 'Smith Dental' } });
    expect(withSample.text).toContain("You also asked for a real sample brief for Smith Dental. Once you've confirmed, we'll build it from public information and email you a link when it's ready.");
  });

  it('business variant names no agency', async () => {
    const out = await renderEmail({ template: 'waitlist_confirmation', props: { ...props, kind: 'business', orgName: 'Bo Plumbing', sampleBusinessName: 'Ignored' } });
    expect(out.subject).toBe('Confirm your email for Rival Monday');
    expect(out.text).toContain('Hi Ada, thanks for your interest in weekly competitor briefs for Bo Plumbing.');
    expect(out.text).toContain("we'll introduce you to one that serves businesses like yours");
    expect(out.text).not.toContain('sample brief');
    expect(out.text).not.toContain('Ignored');
    expect(out.text).not.toMatch(/Agency Co/);
  });
});

describe('sample_brief_ready', () => {
  it('subject and body carry the decided copy, link and expiry', async () => {
    const out = await renderEmail({
      template: 'sample_brief_ready',
      props: { branding: platform, contactName: 'Ada', businessName: 'Smith Dental', url: 'https://app.test/sample/TOKEN', expiresAt: '2026-11-27T12:00:00.000Z' },
    });
    expect(out.subject).toBe('Your sample brief for Smith Dental is ready');
    expect(out.text).toContain('Hi Ada, here is the sample starting-point brief we built for Smith Dental from public information.');
    expect(out.text).toContain('Open the sample brief');
    expect(out.html).toContain('href="https://app.test/sample/TOKEN"');
    expect(out.text).toContain(
      "Every statement in it links to the evidence it came from. This is what a client gets in their first week, sent under your agency's name and branding. The link works until November 27, 2026. Questions, or ready to start? Just reply to this email.",
    );
  });
});
