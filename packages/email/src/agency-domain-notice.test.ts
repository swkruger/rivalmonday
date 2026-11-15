import { describe, expect, it } from 'vitest';
import { resolveBranding } from './branding';
import { renderEmail } from './render';
import type { AgencyDomainNoticeKind } from './types';

const URL = 'https://app.rivalmonday.test/agency/settings/domains';
const ERR = "We couldn't verify this domain within 72 hours.";
const CASES: [AgencyDomainNoticeKind, string, string, string][] = [
  ['domain_live', 'intel.agency.com', 'Your domain intel.agency.com is live', 'Client links now use intel.agency.com.'],
  ['domain_failed', 'intel.agency.com', "We couldn't verify intel.agency.com", `${ERR} Check the DNS records on the Domains page and try again.`],
  ['sender_verified', 'agency.com', 'Email from agency.com is ready', 'Client emails now come from agency.com.'],
  ['sender_failed', 'agency.com', "We couldn't verify email for agency.com", `${ERR} Check the DNS records on the Domains page and try again.`],
];

describe('agency_domain_notice email', () => {
  it.each(CASES)('renders each kind, Rival Monday branded: %s', async (kind, name, subject, body) => {
    const out = await renderEmail({
      template: 'agency_domain_notice',
      props: { branding: resolveBranding('Rival Monday', null), kind, name, settingsUrl: URL, ...(kind.endsWith('failed') && { error: ERR }) },
    });
    expect(out.subject).toBe(subject);
    expect(out.text).toContain(body);
    expect(out.text).toContain('Open Domains');
    expect(out.html).toContain(`href="${URL}"`);
    expect(out.html).toContain('Rival Monday');
    expect(out.html).toContain('#2A6BAC');
  });

  it('a failure without an error still renders the next step', async () => {
    const out = await renderEmail({ template: 'agency_domain_notice', props: { branding: resolveBranding('Rival Monday', null), kind: 'domain_failed', name: 'x.agency.com', settingsUrl: URL } });
    expect(out.text).toContain('Check the DNS records on the Domains page and try again.');
    expect(out.text).not.toContain('undefined');
  });
});
