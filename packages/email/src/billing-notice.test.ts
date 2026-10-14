import { describe, expect, it } from 'vitest';
import { resolveBranding } from './branding';
import { renderEmail } from './render';
import type { BillingNoticeKind } from './types';

const URL = 'https://app.rivalmonday.test/agency/settings/billing';
const CASES: [BillingNoticeKind, string, string][] = [
  ['trial_started', 'Your Rival Monday trial has started', 'Your 30-day trial runs until November 13, 2026. Up to 3 clients are included.'],
  ['trial_ending_7', 'Your trial ends in 7 days', 'Add a payment method to keep your clients monitored without interruption.'],
  ['trial_ending_1', 'Your trial ends in 1 day', 'Add a payment method to keep your clients monitored without interruption.'],
  ['trial_ended', 'Your trial has ended', 'Add a payment method to keep going. Service pauses on November 13, 2026.'],
  ['payment_failed', 'Payment failed', "We couldn't charge your card. Service pauses on November 13, 2026 unless payment succeeds."],
  ['service_paused', 'Service is paused', 'Monitoring, briefs and alerts are paused. Update your payment method to resume.'],
  ['account_suspended', 'Your account is suspended', 'Your data is kept. Update your payment method to restore access.'],
  ['account_reactivated', "You're all set", 'Payment received — everything is running again.'],
  ['pilot_ending_7', 'Your pilot ends in 7 days', 'After November 13, 2026 your agency moves to a 30-day trial.'],
];

describe('billing_notice email', () => {
  it.each(CASES)('%s renders the binding subject, body and Open billing button', async (kind, subject, body) => {
    const out = await renderEmail({
      template: 'billing_notice',
      props: { branding: resolveBranding('Rival Monday', null), kind, agencyName: 'Acme Agency', date: '2026-11-13T04:30:00.000Z', billingUrl: URL },
    });
    expect(out.subject).toBe(subject);
    expect(out.text).toContain(body);
    expect(out.text).toContain('Open billing');
    expect(out.html).toContain(`href="${URL}"`);
  });

  it('is Rival Monday branded (not the agency) and carries no client names', async () => {
    const out = await renderEmail({
      template: 'billing_notice',
      props: { branding: resolveBranding('Rival Monday', null), kind: 'payment_failed', agencyName: 'Acme Agency', date: '2026-11-13', billingUrl: URL },
    });
    expect(out.html).toContain('Rival Monday');
    expect(out.html).toContain('#2A6BAC');
    expect(out.text).toContain('November 13, 2026');
    expect(out.text).not.toMatch(/Smith HVAC|Bright Smiles/);
  });

  it('passes a non-ISO date through unchanged', async () => {
    const out = await renderEmail({
      template: 'billing_notice',
      props: { branding: resolveBranding('Rival Monday', null), kind: 'trial_ended', agencyName: 'A', date: 'soon', billingUrl: URL },
    });
    expect(out.text).toContain('Service pauses on soon.');
  });
});
