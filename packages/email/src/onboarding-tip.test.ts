import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveBranding } from './branding';
import { renderEmail } from './render';

const branding = resolveBranding('Rival Monday', null);
const URL = 'https://app.rivalmonday.test/join/SECRET-TOKEN-123';

afterEach(() => vi.restoreAllMocks());


describe('onboarding_tip email', () => {
  const run = (day: 1 | 3 | 7, nextStep: 'profile' | 'team' | 'plan' | 'branding' | 'first_client') =>
    renderEmail({ template: 'onboarding_tip', props: { branding, agencyName: 'Acme Agency', day, nextStep, url: 'https://x.test/c', unsubscribeUrl: 'https://x.test/unsub/abc' } });
  it.each([
    [1, 'Your Rival Monday setup: next step'],
    [3, 'Two minutes to finish setting up Acme Agency'],
    [7, 'Your first competitor brief is one client away'],
  ] as const)('day %s subject', async (day, subject) => {
    expect((await run(day, 'profile')).subject).toBe(subject);
  });
  it.each([
    ['profile', 'Add your contact details so we can reach you about your account.'],
    ['team', "Invite the people who manage your clients — they'll get their own sign-in."],
    ['plan', "Check your plan, and add a payment method whenever you're ready."],
    ['branding', 'Add your logo and colours so client reports look like yours.'],
    ['first_client', "Add your first client and we'll start watching their competitors this week."],
  ] as const)('%s body', async (step, body) => {
    const out = await run(3, step);
    expect(out.text).toContain(body);
    expect(out.text).toContain('Pick up where you left off');
    expect(out.html).toContain('href="https://x.test/c"');
  });
  it('footer carries agency name and unsubscribe url; Rival Monday branded', async () => {
    const out = await run(1, 'team');
    expect(out.text).toContain("You're getting this because you started setting up Acme Agency. Unsubscribe from setup tips: https://x.test/unsub/abc");
    expect(out.html).toContain('#2A6BAC');
    expect(out.html).toContain('href="https://x.test/unsub/abc"');
  });
});

describe('onboarding-tip logging', () => {
  it('rendering never calls console.*', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    await renderEmail({ template: 'onboarding_tip', props: { branding, agencyName: 'A', day: 1, nextStep: 'plan', url: URL, unsubscribeUrl: URL } });
    for (const s of spies) expect(s).not.toHaveBeenCalled();
  });
});
