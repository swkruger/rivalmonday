import { describe, expect, it } from 'vitest';
import { resolveBranding, RIVAL_MONDAY_TOKENS } from './branding';
import { renderEmail } from './render';

const branding = resolveBranding('Acme Marketing', { primary: '#112233', logoUrl: 'javascript:alert(1)' });

describe('branding', () => {
  it('falls back to the agency name and the Rival Monday tokens, refusing unsafe values', () => {
    expect(branding).toMatchObject({ displayName: 'Acme Marketing', primary: '#112233', secondary: RIVAL_MONDAY_TOKENS.secondary, logoUrl: null, fromName: 'Acme Marketing' });
    expect(resolveBranding('Acme', { primary: 'red; background:url(x)', fromEmail: 'nope', displayName: '  ' })).toMatchObject({ primary: RIVAL_MONDAY_TOKENS.primary, fromEmail: null, displayName: 'Acme' });
    expect(resolveBranding('Acme', { logoUrl: 'https://cdn.acme.example/logo.png' }).logoUrl).toBe('https://cdn.acme.example/logo.png');
  });
});

describe('renderEmail', () => {
  it('renders an alert with subject, html, text and the deep link', async () => {
    const r = await renderEmail({ template: 'alert', props: {
      branding, recipientName: 'Pat', clientName: 'A1 HVAC', competitorName: 'Smith HVAC', headline: 'Smith HVAC cut its AC tune-up to $69.',
      body: 'The pricing page now shows $69, down from $89.', detectedOn: '2026-10-05', link: 'https://app.example/l/tok',
    } });
    expect(r.subject).toBe('Smith HVAC cut its AC tune-up to $69.');
    expect(r.html).toContain('href="https://app.example/l/tok"');
    expect(r.html).toContain('#112233');
    expect(r.text).toContain('The pricing page now shows $69, down from $89.');
    expect(r.html).not.toMatch(/rival ?monday/i); // white-label
  });

  it('escapes scraped text instead of injecting markup', async () => {
    const r = await renderEmail({ template: 'alert', props: {
      branding, recipientName: null, clientName: 'A1', competitorName: '<script>x</script>', headline: 'Hi <b>there</b>', body: 'b', detectedOn: '2026-10-05', link: 'https://app.example/l/t',
    } });
    expect(r.html).not.toContain('<script>x</script>');
    expect(r.html).toContain('&lt;b&gt;there&lt;/b&gt;');
  });

  it('renders a digest listing every alert and an agency notice', async () => {
    const d = await renderEmail({ template: 'alert_digest', props: {
      branding, recipientName: null, clientName: 'A1 HVAC', date: '2026-10-05', link: 'https://app.example/l/d',
      alerts: [1, 2, 3].map((n) => ({ competitorName: 'Smith HVAC', headline: `Headline ${n}`, body: `Body ${n}`, link: `https://app.example/l/${n}` })),
    } });
    expect(d.subject).toBe('3 more competitor alerts for A1 HVAC');
    for (const n of [1, 2, 3]) expect(d.html).toContain(`Headline ${n}`);
    const a = await renderEmail({ template: 'agency_notice', props: {
      branding, recipientName: 'Sam', clientName: 'A1 HVAC', notice: 'brief_ready', title: 'Brief ready for review: A1 HVAC', lines: ['3 items.'], link: 'https://app.example/l/b', actionLabel: 'Review brief',
    } });
    expect(a.subject).toBe('Brief ready for review: A1 HVAC');
    expect(a.text).toContain('3 items.');
  });

  it.each([
    ['setup_suggestions_ready', 'Competitor suggestions are ready for A1 HVAC'],
    ['setup_client_changed', 'A1 HVAC updated their setup'],
    ['setup_idle', "A1 HVAC's setup is waiting on you"],
  ] as const)('agency_notice renders the %s setup notice with its title as subject', async (notice, title) => {
    const r = await renderEmail({ template: 'agency_notice', props: { branding, recipientName: 'Sam', clientName: 'A1 HVAC', notice, title, lines: ['One line.'], link: 'https://app.example/l/s', actionLabel: 'Open setup' } });
    expect(r.subject).toBe(title);
    expect(r.text).toContain('One line.');
    expect(r.html).toContain('Open setup');
  });
});

describe('agency_hold', () => {
  const rm = resolveBranding('Rival Monday', null);
  const props = (kind: 'started' | 'lifted') => ({ branding: rm, recipientName: 'Ann Admin', agencyName: 'Peak Digital', kind, supportEmail: 'help@rivalmonday.app' });

  it('started: exact subject and both body lines', async () => {
    const r = await renderEmail({ template: 'agency_hold', props: props('started') });
    expect(r.subject).toBe('Your Peak Digital account is on hold');
    expect(r.text).toContain('Hi Ann,');
    expect(r.text).toContain('Your Peak Digital account is on hold. Your team can still sign in and see everything, but changes and scheduled work are paused, and so is billing.');
    expect(r.text).toContain('To restore it, reply to this email or contact help@rivalmonday.app.');
  });

  it('lifted: exact subject and body line, no restore line', async () => {
    const r = await renderEmail({ template: 'agency_hold', props: { ...props('lifted'), recipientName: null } });
    expect(r.subject).toBe('Your Peak Digital account is active again');
    expect(r.text).toContain('Hi,');
    expect(r.text).toContain('The hold on your Peak Digital account has been lifted. Your team can make changes again, and scheduled work and billing resume today.');
    expect(r.text).not.toContain('To restore it');
  });
});
