import { brandLeaks } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { resolveBranding } from './branding';
import { EMAIL_PREVIEWS } from './previews';
import { renderEmail } from './render';
import type { EmailPayload } from './types';

/** 13a2 Task 11: every client-facing template, rendered for an agency with no branding set, never names the platform. */
type Template = EmailPayload['template'];
export const TEMPLATE_AUDIENCE: Record<Template, 'client' | 'staff'> = {
  alert: 'client', alert_digest: 'client', brief: 'client', trend_report: 'client', sign_in: 'client', client_invite: 'client', competitor_review: 'client',
  client_billing_notice: 'client', lead_verify: 'client', lead_confirmation: 'client', lead_declined: 'client',
  agency_notice: 'staff', support_session_started: 'staff', agency_hold: 'staff', platform_cost_low: 'staff', platform_spend_alert: 'staff', platform_ops_alert: 'staff',
  billing_notice: 'staff', team_invite: 'staff', agency_client_billing_notice: 'staff', agency_invite: 'staff', agency_welcome: 'staff', onboarding_tip: 'staff',
  platform_signup_notice: 'staff', waitlist_confirmation: 'staff', sample_brief_ready: 'staff', lead_new: 'staff', agency_plan_change: 'staff', agency_domain_notice: 'staff',
};

const FIXTURE = resolveBranding('Cool Agency', null);
const APP_URL = 'https://rivalmonday.app'; // the platform origin
const NEUTRAL = 'https://cool-agency.example-neutral.test'; // where a client's links live
// Preview links point at app.example.com; delivery puts a client's links on the agency/neutral origin, never the platform host.
const onOrigin = <T,>(v: T, origin: string): T => JSON.parse(JSON.stringify(v).replaceAll('https://app.example.com', origin)) as T;
const withFixture = (p: EmailPayload) => ({ ...p, props: { ...p.props, branding: FIXTURE } }) as EmailPayload;

// `sign_in.signup` is the agency sign-up confirmation (an agency owner, not a client, on the platform): agency audience, may name the platform (Q9).
const isAgencySignup = (p: { payload: EmailPayload }) => p.payload.template === 'sign_in' && !!p.payload.props.signup;
const clientPreviews = EMAIL_PREVIEWS.filter((p) => TEMPLATE_AUDIENCE[p.payload.template] === 'client' && !isAgencySignup(p));

describe('email leak sweep (client templates)', () => {
  it('the client set is exactly the 11 client templates', () => {
    expect(new Set(clientPreviews.map((p) => p.payload.template))).toEqual(new Set(
      ['alert', 'alert_digest', 'brief', 'trend_report', 'sign_in', 'client_invite', 'competitor_review', 'client_billing_notice', 'lead_verify', 'lead_confirmation', 'lead_declined'],
    ));
  });

  it.each(clientPreviews.map((p) => [p.id, p] as const))('%s: subject, html and text carry no brand leak', async (_id, p) => {
    const out = await renderEmail(onOrigin(withFixture(p.payload), NEUTRAL));
    expect(brandLeaks(out.subject), 'subject').toEqual([]);
    expect(brandLeaks(out.html), 'html').toEqual([]);
    expect(brandLeaks(out.text), 'text').toEqual([]);
  });
});

describe('the sweep sees the platform origin', () => {
  it('a client link built on the platform host is caught (control)', async () => {
    const p = clientPreviews.find((x) => x.id === 'client_invite')!;
    const out = await renderEmail(onOrigin(withFixture(p.payload), APP_URL));
    expect(brandLeaks(out.html)).toContain('platform name');
    expect(brandLeaks(out.text)).toContain('platform name');
  });
});
