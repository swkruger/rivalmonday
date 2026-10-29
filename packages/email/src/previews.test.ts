import { describe, expect, it } from 'vitest';
import { DOCUMENT_PREVIEWS, EMAIL_PREVIEWS } from './previews';
import { renderEmail } from './render';
import type { EmailPayload } from './types';

const ALL = [
  'alert', 'alert_digest', 'agency_notice', 'brief', 'trend_report', 'sign_in', 'support_session_started', 'agency_hold', 'platform_cost_low',
  'platform_spend_alert', 'platform_ops_alert', 'billing_notice', 'client_invite', 'team_invite', 'competitor_review', 'client_billing_notice',
  'agency_client_billing_notice', 'agency_invite', 'agency_welcome', 'onboarding_tip', 'platform_signup_notice', 'lead_verify', 'lead_confirmation',
  'waitlist_confirmation', 'sample_brief_ready', 'lead_declined', 'lead_new', 'agency_plan_change',
] as const satisfies readonly EmailPayload['template'][];
// Compile-time exhaustiveness: a new template id that is missing from ALL makes this a type error.
const exhaustive: Exclude<EmailPayload['template'], (typeof ALL)[number]> extends never ? true : false = true;

/** White-label rule from the template tests: these are agency-branded, so their output never names Rival Monday. */
const WHITE_LABEL = new Set<EmailPayload['template']>([
  'alert', 'alert_digest', 'brief', 'trend_report', 'client_invite', 'competitor_review', 'client_billing_notice', 'team_invite',
  'lead_verify', 'lead_confirmation', 'lead_declined', 'lead_new', 'agency_notice', 'sign_in',
]);

describe('email previews', () => {
  it('every template id has a preview', () => {
    expect(exhaustive).toBe(true);
    expect(new Set(EMAIL_PREVIEWS.map((p) => p.payload.template))).toEqual(new Set(ALL));
  });

  it('ids are unique', () => {
    const ids = [...EMAIL_PREVIEWS, ...DOCUMENT_PREVIEWS].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every preview renders with non-empty subject and text', async () => {
    for (const p of EMAIL_PREVIEWS) {
      const out = await renderEmail(p.payload);
      expect(out.subject.trim(), p.id).not.toBe('');
      expect(out.text.trim(), p.id).not.toBe('');
      expect(out.html, p.id).toContain('<');
    }
  });

  it('every document preview renders HTML', async () => {
    for (const d of DOCUMENT_PREVIEWS) expect(await d.render(), d.id).toContain('@page');
  });

  it('client-facing previews never contain "Rival Monday"', async () => {
    const facing = EMAIL_PREVIEWS.filter((p) => WHITE_LABEL.has(p.payload.template) && p.payload.props.branding.displayName !== 'Rival Monday');
    expect(facing.length).toBeGreaterThan(10);
    for (const p of facing) {
      const out = await renderEmail(p.payload);
      for (const s of [out.subject, out.html, out.text]) expect(s, p.id).not.toMatch(/rival[\s-]*monday/i);
    }
  });
});
