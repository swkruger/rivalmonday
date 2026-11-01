import { describe, expect, it } from 'vitest';
import { resolveAgencyContact, resolveBranding } from './branding';
import { DOCUMENT_PREVIEWS, EMAIL_PREVIEWS } from './previews';
import { renderEmail } from './render';

const CLIENT_FACING = ['alert', 'alert_digest', 'brief', 'trend_report', 'client_invite', 'competitor_review', 'client_billing_notice', 'lead_verify', 'lead_declined'];
const contact = { name: 'Sam Lee', phone: '555-0100', email: 'sam@example.com', address: '100 Main St, Austin, TX 78701' };
const preview = (id: string) => EMAIL_PREVIEWS.find((p) => p.id === id)!;

describe('resolveAgencyContact', () => {
  it('formats the address and trims every field', () => {
    expect(resolveAgencyContact({ contactName: ' Sam Lee ', phone: '555-0100', contactEmail: 'sam@example.com', line1: '100 Main St', line2: '', city: 'Austin', region: 'TX', postalCode: '78701' })).toEqual(contact);
  });
  it('drops an invalid email', () => {
    expect(resolveAgencyContact({ contactEmail: 'nope', phone: '555-0100' })).toEqual({ name: null, phone: '555-0100', email: null, address: null });
  });
  it('is null when a client has no way to get in touch', () => {
    expect(resolveAgencyContact(null)).toBeNull();
    expect(resolveAgencyContact({ contactName: 'Sam Lee', phone: ' ', contactEmail: '' })).toBeNull();
  });
});

describe('agency contact block', () => {
  it.each(CLIENT_FACING)('%s shows the agency contact', async (template) => {
    const p = EMAIL_PREVIEWS.find((x) => x.payload.template === template)!;
    const { text } = await renderEmail(p.payload);
    expect(text).toContain('Questions? Get in touch:');
    expect(text).toContain('Sam Lee · Northwind Marketing');
    expect(text).toContain('555-0100 · sam@example.com');
    expect(text).toContain('100 Main St, Austin, TX 78701');
    expect(text).not.toContain('mailto:');
  });

  it('is hidden when the agency has no contact details', async () => {
    const p = preview('client_invite').payload;
    if (p.template !== 'client_invite') throw new Error('wrong preview');
    const { text } = await renderEmail({ template: 'client_invite', props: { ...p.props, branding: resolveBranding('Northwind Marketing', null) } });
    expect(text).not.toContain('Get in touch');
  });

  it('is not shown on agency-facing mail, platform mail or the PDFs', async () => {
    for (const id of ['agency_notice.brief_ready', 'team_invite', 'lead_new', 'billing_notice.trial_started', 'lead_confirmation.pool_ready']) {
      expect((await renderEmail(preview(id).payload)).text, id).not.toContain('Get in touch');
    }
    for (const d of DOCUMENT_PREVIEWS) expect(await d.render(), d.id).not.toContain('Get in touch');
  });
});

describe('email introductions', () => {
  it('client mail says who it is from, without naming the platform', async () => {
    for (const id of ['alert', 'alert_digest', 'brief', 'brief.quiet', 'brief.starting_point', 'trend_report', 'competitor_review', 'client_billing_notice.client-payment-needed', 'lead_declined']) {
      const { text } = await renderEmail(preview(id).payload);
      expect(text, id).toMatch(/This is (a billing message from )?Northwind Marketing/);
      expect(text, id).not.toMatch(/rival\s*monday/i);
    }
  });

  it('platform mail to agencies says it is from Rival Monday', async () => {
    for (const id of ['billing_notice.payment_failed', 'agency_client_billing_notice.client-paid', 'agency_hold.lifted', 'agency_plan_change.next_billing', 'support_session_started', 'onboarding_tip.day1.team']) {
      expect((await renderEmail(preview(id).payload)).text, id).toMatch(/This is (a security notice from )?Rival Monday/);
    }
  });

  it('agency notices say what to do for every notice kind', async () => {
    const notices = EMAIL_PREVIEWS.filter((p) => p.payload.template === 'agency_notice');
    expect(notices).toHaveLength(9);
    for (const n of notices) {
      const { text } = await renderEmail(n.payload);
      expect(text, n.id).toContain('This is an automatic notice from your Northwind Marketing account.');
      expect(text, n.id).not.toContain('undefined');
    }
  });

  it('the PDFs carry no email introduction', async () => {
    for (const d of DOCUMENT_PREVIEWS) expect(await d.render(), d.id).not.toContain('This is Northwind Marketing');
  });
});
