import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveBranding } from './branding';
import { renderEmail } from './render';

const branding = resolveBranding('Rival Monday', null);
const URL = 'https://app.rivalmonday.test/join/SECRET-TOKEN-123';

afterEach(() => vi.restoreAllMocks());


describe('agency_welcome email', () => {
  it('renders subject, body and button', async () => {
    const out = await renderEmail({ template: 'agency_welcome', props: { branding, agencyName: 'Acme Agency', url: 'https://app.rivalmonday.test/agency/onboarding' } });
    expect(out.subject).toBe('Welcome to Rival Monday');
    expect(out.text).toContain('Acme Agency is set up. Next: tell us about your agency, invite your team and add your first client. It takes about 10 minutes, and you can stop anytime.');
    expect(out.text).toContain('Continue setup');
    expect(out.html).toContain('href="https://app.rivalmonday.test/agency/onboarding"');
    expect(out.html).toContain('#2A6BAC');
  });
});

describe('agency-welcome logging', () => {
  it('rendering never calls console.*', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    await renderEmail({ template: 'agency_welcome', props: { branding, agencyName: 'A', url: URL } });
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});
