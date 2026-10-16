import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveBranding } from './branding';
import { renderEmail } from './render';

const branding = resolveBranding('Rival Monday', null);
const URL = 'https://app.rivalmonday.test/join/SECRET-TOKEN-123';

afterEach(() => vi.restoreAllMocks());


describe('platform_signup_notice email', () => {
  it.each([[null], [''], ['   ']])('contact name %j renders the email alone', async (contactName) => {
    const out = await renderEmail({ template: 'platform_signup_notice', props: { branding, agencyName: 'A', contactName, email: 'jo@acme.test', source: 'open', offer: 'trial', consoleUrl: 'https://x.test/c' } });
    expect(out.text).toContain('Contact: jo@acme.test');
    expect(out.text).not.toMatch(/null|<jo@acme\.test>/);
  });
  it('pilot without an end date renders "Offer: Pilot"', async () => {
    const out = await renderEmail({ template: 'platform_signup_notice', props: { branding, agencyName: 'A', contactName: 'Jo', email: 'jo@acme.test', source: 'invite', offer: 'pilot', consoleUrl: 'https://x.test/c' } });
    expect(out.text).toMatch(/Offer: Pilot(?! until)/);
  });
  const props = { branding, agencyName: 'Acme Agency', contactName: 'Jo Smith', email: 'jo@acme.test', consoleUrl: 'https://app.rivalmonday.test/console/agencies/1' };
  it('open sign-up trial', async () => {
    const out = await renderEmail({ template: 'platform_signup_notice', props: { ...props, source: 'open', offer: 'trial' } });
    expect(out.subject).toBe('New agency sign-up: Acme Agency');
    expect(out.text).toContain('Contact: Jo Smith <jo@acme.test>');
    expect(out.text).toContain('Source: Open sign-up');
    expect(out.text).toContain('Offer: Trial');
    expect(out.text).toContain('Open in console');
    expect(out.html).toContain(`href="${props.consoleUrl}"`);
  });
  it('invite link pilot', async () => {
    const out = await renderEmail({ template: 'platform_signup_notice', props: { ...props, source: 'invite', offer: 'pilot', pilotEndsAt: '2026-12-01T00:00:00.000Z' } });
    expect(out.text).toContain('Source: Invite link');
    expect(out.text).toContain('Offer: Pilot until December 1, 2026');
  });
});

describe('platform-signup-notice logging', () => {
  it('rendering never calls console.*', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    await renderEmail({ template: 'platform_signup_notice', props: { branding, agencyName: 'A', contactName: 'B', email: 'b@c.d', source: 'open', offer: 'trial', consoleUrl: URL } });
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});
