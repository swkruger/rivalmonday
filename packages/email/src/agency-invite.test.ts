import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveBranding } from './branding';
import { renderEmail } from './render';

const branding = resolveBranding('Rival Monday', null);
const URL = 'https://app.rivalmonday.test/join/SECRET-TOKEN-123';

afterEach(() => vi.restoreAllMocks());


describe('agency_invite email', () => {
  const base = { branding, url: URL, expiresAt: '2026-10-30T12:00:00.000Z' };
  it('trial offer with discount', async () => {
    const out = await renderEmail({ template: 'agency_invite', props: { ...base, offer: 'trial', discountText: '20% off the first 3 months' } });
    expect(out.subject).toBe("You're invited to Rival Monday");
    expect(out.text).toContain("Rival Monday watches your clients' local competitors and sends a weekly brief with evidence for every claim.");
    expect(out.text).toContain('Your invite includes a 30-day trial with 20% off the first 3 months.');
    expect(out.text).toContain('This link works until October 30, 2026.');
    expect(out.text).toContain('Create your agency');
    expect(out.html).toContain(`href="${URL}"`);
    expect(out.html).toContain('#2A6BAC');
  });
  it('trial offer without discount', async () => {
    const out = await renderEmail({ template: 'agency_invite', props: { ...base, offer: 'trial' } });
    expect(out.text).toContain('Your invite includes a 30-day trial.');
  });
  it('pilot with and without end date', async () => {
    const a = await renderEmail({ template: 'agency_invite', props: { ...base, offer: 'pilot', pilotEndsAt: '2026-12-01' } });
    expect(a.text).toContain("You're invited to our pilot until December 1, 2026.");
    const b = await renderEmail({ template: 'agency_invite', props: { ...base, offer: 'pilot' } });
    expect(b.text).toContain("You're invited to our pilot.");
  });
});

describe('agency-invite logging', () => {
  it('rendering never calls console.*', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    await renderEmail({ template: 'agency_invite', props: { branding, url: URL, offer: 'trial', expiresAt: '2026-10-30' } });
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});
