import { describe, expect, it } from 'vitest';
import { resolveBranding } from './branding';
import { renderEmail } from './render';

const branding = resolveBranding('Acme Agency', { displayName: 'Acme Comfort', primary: '#112233', logoUrl: 'https://acme.test/logo.png' });

describe('client_billing_notice email', () => {
  it('client-payment-link: binding copy, agency branding, no Rival Monday', async () => {
    const out = await renderEmail({ template: 'client_billing_notice', props: { branding, kind: 'client-payment-link', agencyName: 'Acme Comfort', actionUrl: 'https://checkout.stripe.test/c/1' } });
    expect(out.subject).toBe('Acme Comfort has set up billing for your competitor reports');
    expect(out.text).toContain('Acme Comfort now bills your competitor reports through a secure payment page. It takes about a minute.');
    expect(out.text).toContain('Set up payment');
    expect(out.html).toContain('href="https://checkout.stripe.test/c/1"');
    expect(out.html).toContain('#112233');
    expect(out.html).toContain('alt="Acme Comfort"');
    for (const s of [out.subject, out.html, out.text]) expect(s).not.toMatch(/rival\s*monday/i);
  });

  it('client-payment-needed: binding copy, no Rival Monday', async () => {
    const out = await renderEmail({ template: 'client_billing_notice', props: { branding: resolveBranding('Acme Agency', null), kind: 'client-payment-needed', agencyName: 'Acme Agency', actionUrl: 'https://app.test/c/1/settings/billing' } });
    expect(out.subject).toBe('Payment needed for your competitor reports');
    expect(out.text).toContain("We couldn't process your latest payment. Please update your payment method to keep your reports running.");
    expect(out.text).toContain('Update payment');
    expect(out.html).toContain('Acme Agency');
    for (const s of [out.subject, out.html, out.text]) expect(s).not.toMatch(/rival\s*monday/i);
  });
});

describe('agency_client_billing_notice email', () => {
  const rm = resolveBranding('Rival Monday', null);
  it.each([
    ['client-payment-failed', "Smith HVAC's payment failed"],
    ['client-paid', 'Smith HVAC is now paying'],
    ['client-auto-paused', 'Smith HVAC was paused after 14 days without payment'],
  ] as const)('%s renders client name, n and the Open client billing button', async (kind, subject) => {
    const out = await renderEmail({ template: 'agency_client_billing_notice', props: { branding: rm, kind, clientName: 'Smith HVAC', n: 14, billingUrl: 'https://app.test/agency/settings/billing' } });
    expect(out.subject).toBe(subject);
    expect(out.text).toContain('Smith HVAC');
    expect(out.text).toContain('Open client billing');
    expect(out.html).toContain('href="https://app.test/agency/settings/billing"');
    expect(out.html).toContain('Rival Monday');
  });
});
