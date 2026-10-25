import { describe, expect, it } from 'vitest';
import { resolveBranding } from './branding';
import { renderEmail } from './render';
import type { AlertEmailProps } from './types';

const alert: AlertEmailProps = {
  branding: resolveBranding('Acme Marketing', null), recipientName: 'Pat', clientName: 'A1 HVAC', competitorName: 'Smith HVAC',
  headline: 'Smith HVAC cut its AC tune-up to $69.', body: 'The pricing page now shows $69.', detectedOn: '2026-10-05', link: 'https://app.example/l/tok',
};

describe('alert feedback line (7c2)', () => {
  it('alert shows the line', async () => {
    const r = await renderEmail({ template: 'alert', props: { ...alert, feedback: { email: 'sam@acme.example', name: 'Sam' } } });
    expect(r.text).toContain('Something look off? Reply to this email or write to Sam at sam@acme.example');
    expect(r.html).toContain(`href="mailto:sam@acme.example?subject=${encodeURIComponent('Feedback: Smith HVAC cut its AC tune-up to $69.')}"`);
    expect(r.html).not.toMatch(/rival ?monday/i);
  });

  it('falls back to "your agency" and is hidden without a contact', async () => {
    const r = await renderEmail({ template: 'alert', props: { ...alert, feedback: { email: 'hello@acme.example', name: null } } });
    expect(r.text).toContain('Something look off? Reply to this email or write to your agency at hello@acme.example');
    const none = await renderEmail({ template: 'alert', props: { ...alert, feedback: null } });
    expect(none.text).not.toContain('Something look off?');
  });
});
