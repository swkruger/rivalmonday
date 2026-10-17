import { describe, expect, it } from 'vitest';
import { resolveBranding } from './branding';
import { renderEmail } from './render';
import type { LeadPreview } from '@cs/db';

const agency = resolveBranding('Acme Agency', { displayName: 'Acme Dental Marketing', primary: '#112233' });
const platform = resolveBranding('Rival Monday', null);
const ready: LeadPreview = {
  status: 'ready', self: { name: 'Smith Dental', rating: 4.5, votes: 40 }, nearby: [{ name: 'Bright Smiles', rating: 4.8, votes: 120, distanceKm: 1.2 }],
  facts: ['3 of 5 nearby dentists have more reviews than you.', 'Your closest competitor is Bright Smiles, 1.2 km away.'], summary: 'You trail on review volume.', category: 'Dentist', generatedAt: '2026-10-17T00:00:00Z',
};
const no = (s: string) => expect(s).not.toMatch(/rival\s*monday/i);

describe('lead emails', () => {
  it('lead_verify: binding copy and button', async () => {
    const out = await renderEmail({ template: 'lead_verify', props: { branding: agency, businessName: 'Smith Dental', verifyUrl: 'https://app.test/start/verify/abc' } });
    expect(out.subject).toBe('Confirm your email to see your competitor snapshot');
    expect(out.text).toContain('Click below to confirm your email and see how Smith Dental compares with nearby businesses.');
    expect(out.text).toContain('See my snapshot');
    expect(out.html).toContain('href="https://app.test/start/verify/abc"');
    expect(out.html).toContain('#112233');
  });

  it('lead_confirmation: inline facts, summary and agency line', async () => {
    const out = await renderEmail({ template: 'lead_confirmation', props: { branding: agency, businessName: 'Smith Dental', agencyName: 'Acme Dental Marketing', preview: ready } });
    expect(out.subject).toBe('Your competitor snapshot for Smith Dental');
    expect(out.text).toContain('3 of 5 nearby dentists have more reviews than you.');
    expect(out.text).toContain('You trail on review volume.');
    expect(out.text).toContain('Acme Dental Marketing will be in touch within one business day.');
  });

  it('lead_confirmation: failed preview wording', async () => {
    const out = await renderEmail({ template: 'lead_confirmation', props: { branding: agency, businessName: 'Smith Dental', agencyName: 'Acme Dental Marketing', preview: { status: 'failed' } } });
    expect(out.text).toContain("We couldn't build your snapshot, but Acme Dental Marketing has your details.");
  });

  it('lead_declined: binding copy', async () => {
    const out = await renderEmail({ template: 'lead_declined', props: { branding: agency, businessName: 'Smith Dental', agencyName: 'Acme Dental Marketing' } });
    expect(out.subject).toBe('About your request, Smith Dental');
    expect(out.text).toContain("Thanks for your interest. Acme Dental Marketing isn't able to take on new clients in your area right now.");
  });

  it('lead_new: business, contact, ref and link', async () => {
    const out = await renderEmail({ template: 'lead_new', props: { branding: agency, businessName: 'Smith Dental', contactName: 'Sam', contactEmail: 's@x.com', contactPhone: '555', ref: 'flyer', leadsUrl: 'https://app.test/agency/leads', pool: false } });
    expect(out.subject).toBe('New lead: Smith Dental');
    expect(out.text).toContain('Sam (s@x.com, 555)');
    expect(out.text).toContain('Ref: flyer');
    expect(out.html).toContain('href="https://app.test/agency/leads"');
  });

  it('agency-branded templates never contain "Rival Monday"', async () => {
    const outs = await Promise.all([
      renderEmail({ template: 'lead_verify', props: { branding: agency, businessName: 'B', verifyUrl: 'https://a.test/x' } }),
      renderEmail({ template: 'lead_confirmation', props: { branding: agency, businessName: 'B', agencyName: 'Acme Dental Marketing', preview: ready } }),
      renderEmail({ template: 'lead_confirmation', props: { branding: agency, businessName: 'B', agencyName: 'Acme Dental Marketing', preview: { status: 'failed' } } }),
      renderEmail({ template: 'lead_declined', props: { branding: agency, businessName: 'B', agencyName: 'Acme Dental Marketing' } }),
      renderEmail({ template: 'lead_new', props: { branding: agency, businessName: 'B', contactName: 'S', contactEmail: 's@x.com', contactPhone: null, ref: null, leadsUrl: 'https://a.test/agency/leads', pool: false } }),
    ]);
    for (const o of outs) for (const s of [o.subject, o.html, o.text]) no(s);
  });

  it('pool template contains the platform line', async () => {
    const conf = await renderEmail({ template: 'lead_confirmation', props: { branding: platform, businessName: 'Smith Dental', agencyName: null, preview: ready } });
    expect(conf.text).toContain("We'll match you with a local marketing partner and they'll be in touch.");
    const failed = await renderEmail({ template: 'lead_confirmation', props: { branding: platform, businessName: 'Smith Dental', agencyName: null, preview: { status: 'failed' } } });
    expect(failed.text).toContain("We couldn't build your snapshot, but we have your details.");
    const pool = await renderEmail({ template: 'lead_new', props: { branding: platform, businessName: 'Smith Dental', contactName: 'Sam', contactEmail: 's@x.com', contactPhone: null, ref: null, leadsUrl: 'https://app.test/platform/leads', pool: true } });
    expect(pool.html).toContain('href="https://app.test/platform/leads"');
    expect(pool.html).toMatch(/Rival Monday/i);
  });
});
