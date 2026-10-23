import { describe, expect, it } from 'vitest';
import { resolveBranding } from './branding';
import { renderEmail } from './render';

const rm = resolveBranding('Rival Monday', null);

describe('client_spend_paused agency notice (C6/C2)', () => {
  it('renders the binding subject, body and button; no $, cost or product name in subject/body', async () => {
    const out = await renderEmail({ template: 'agency_client_billing_notice', props: { branding: rm, kind: 'client_spend_paused', clientName: 'Smith HVAC', until: 'November 1', billingUrl: 'https://app.test/agency/settings/usage' } });
    expect(out.subject).toBe('Smith HVAC: AI work paused until November 1');
    expect(out.text).toContain(
      "AI work for Smith HVAC is paused until November 1 — it went well past this month's credits. Past briefs and evidence stay available. Contact support to raise the limit.",
    );
    expect(out.text).toContain('Open usage');
    expect(out.html).toContain('href="https://app.test/agency/settings/usage"');
    // The Layout header carries the (platform-branded) agency email's brand name; the copy itself must stay clean.
    const body = out.text.split(/\r?\n/).find((l) => l.startsWith('AI work for'))!;
    for (const s of [out.subject, body]) {
      expect(s).not.toMatch(/rival\s*monday/i);
      expect(s).not.toContain('$');
      expect(s).not.toMatch(/cost/i);
    }
  });
});

describe('platform_spend_alert email (C9)', () => {
  it('uses the caller title as subject, lists the lines and the button', async () => {
    const out = await renderEmail({
      template: 'platform_spend_alert',
      props: { branding: rm, kind: 'client_paused', title: 'Smith HVAC (Acme) paused for spend', lines: ['Smith HVAC used $19.50 of its $15.00 limit this month (pause at 130 %). Raise the limit on the agency page or it lifts on November 1.'], url: 'https://app.test/platform/agencies/a1' },
    });
    expect(out.subject).toBe('Smith HVAC (Acme) paused for spend');
    expect(out.text).toContain('used $19.50 of its $15.00 limit');
    expect(out.html).toContain('href="https://app.test/platform/agencies/a1"');
  });
});
