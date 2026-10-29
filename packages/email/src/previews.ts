import type { LeadPreview } from '@cs/db';
import { resolveBranding } from './branding';
import { renderBriefDocument, renderTrendReportDocument } from './document';
import type {
  AgencyClientBillingNoticeKind, AgencyNoticeProps, AlertEmailProps, BillingNoticeKind, BriefEmailItem, BriefEmailProps, ClientBillingNoticeKind,
  EmailPayload, OnboardingTipProps, PlanTerms, PlatformOpsAlertProps, PlatformSpendAlertProps, ScorecardModel, TrendReportEmailProps,
} from './types';

/**
 * Copy sign-off previews: every email template and every wording-changing variant, built from neutral demo data
 * (agency "Northwind Marketing", client "Bright Smile Dental", `@example.com`, no real people). Data only.
 * Ids are `<template>` or `<template>.<variant>`.
 */
export interface EmailPreview { id: string; label: string; payload: EmailPayload }
export interface DocumentPreview { id: string; label: string; render: () => Promise<string> }

const agency = resolveBranding('Northwind Marketing', null);
const platform = resolveBranding('Rival Monday', null);
const CLIENT = 'Bright Smile Dental';
const AGENCY = 'Northwind Marketing';
const APP = 'https://app.example.com';
const PERSON = 'Sam Lee';

const sam = { email: 'sam@example.com', name: PERSON };

// ---- briefs and trend report -------------------------------------------------------------------------------------
const item = (n: number): BriefEmailItem => ({
  competitorName: 'Harbor Dental', headline: `Harbor Dental now advertises free whitening (${n})`, whatChanged: 'Its home page now offers a free whitening session with every new-patient exam.',
  whyItMatters: 'New patients comparing offers nearby may pick the free extra.', recommendedAction: 'Add a clear new-patient offer to your own home page.', effort: 'L', impact: 'H', link: `${APP}/l/item${n}`,
});
const trend = {
  windowDays: 30, events: 4,
  businesses: [
    { competitorId: 'c1', name: CLIENT, self: true, reviews: 12, avgRating: 4.6, prevAvgRating: 4.5, activeAds: null },
    { competitorId: 'c2', name: 'Harbor Dental', self: false, reviews: 30, avgRating: 4.1, prevAvgRating: 4.4, activeAds: 7 },
  ],
};
const scorecard: ScorecardModel = {
  tiles: [
    { label: 'Rating', value: '4.6', sub: 'rivals 4.4 median', trend: null, trendText: null },
    { label: 'New reviews · 90 d', value: '12', sub: 'rivals 30 median', trend: 'up', trendText: '▲ 4 since your starting point' },
    { label: 'Reply rate', value: '—', sub: 'rivals 50% median', trend: null, trendText: null },
    { label: 'Top-3 in map pack', value: '31%', sub: 'rivals 20% median', trend: 'down', trendText: '▼ 6 pts since your starting point' },
  ],
  table: { headers: ['Business', 'Rating'], rows: [{ cells: [`${CLIENT} (you)`, '4.6'], self: true, tier: null }, { cells: ['Harbor Dental', '4.4'], self: false, tier: 'top' }] },
  openFirstMoves: ['Reply to your recent reviews'],
};
const brief: BriefEmailProps = {
  branding: agency, recipientName: 'Jordan', clientName: CLIENT, deliveryDate: '2026-10-05', kind: 'standard', summary: 'One competitor changed its offer this week.',
  items: [item(1), item(2)], trend, link: `${APP}/l/brief`, pdfLink: `${APP}/l/pdf`, signOff: `— ${PERSON}, ${AGENCY}`,
};
const startingPoint: BriefEmailProps = {
  ...brief, kind: 'starting_point', summary: `Where ${CLIENT} stands against the 2 rivals we now watch.`, scorecard, items: [{ ...item(1), subject: 'self', competitorName: CLIENT }],
};
const report: TrendReportEmailProps = {
  branding: agency, recipientName: null, clientName: CLIENT, quarter: '2026-Q3', link: `${APP}/l/report`, pdfLink: null,
  data: {
    quarter: '2026-Q3', windowDays: 90, businesses: trend.businesses, eventsByType: { price_change: 3, ad_started: 5 },
    moves: [{ moveType: 'price_war', competitorName: 'Harbor Dental', status: 'active', firstDetectedAt: '2026-08-12' }],
    briefsSent: 12, alertsDelivered: 4, recommendations: { created: 9, done: 3, inProgress: 2, dismissed: 1 },
  },
};
const alertProps: AlertEmailProps = {
  branding: agency, recipientName: 'Jordan', clientName: CLIENT, competitorName: 'Harbor Dental', headline: 'Harbor Dental cut its cleaning price to $69.',
  body: 'The pricing page now shows $69, down from $89.', detectedOn: '2026-10-05', link: `${APP}/l/alert`,
};

// ---- helpers for variant families ---------------------------------------------------------------------------------
const agencyNotice = (notice: AgencyNoticeProps['notice'], title: string, lines: string[], actionLabel: string): EmailPreview => ({
  id: `agency_notice.${notice}`, label: `Agency notice: ${notice}`,
  payload: { template: 'agency_notice', props: { branding: agency, recipientName: PERSON, clientName: CLIENT, notice, title, lines, link: `${APP}/l/notice`, actionLabel } },
});
const BILLING_KINDS = ['trial_started', 'trial_ending_7', 'trial_ending_1', 'trial_ended', 'payment_failed', 'service_paused', 'account_suspended', 'account_reactivated', 'pilot_ending_7'] as const satisfies readonly BillingNoticeKind[];
/** Compile-time: a new `BillingNoticeKind` missing from BILLING_KINDS is a type error. */
export const BILLING_KINDS_EXHAUSTIVE: Exclude<BillingNoticeKind, (typeof BILLING_KINDS)[number]> extends never ? true : false = true;
const billing = (kind: BillingNoticeKind): EmailPreview => ({
  id: `billing_notice.${kind}`, label: `Billing notice: ${kind}`,
  payload: { template: 'billing_notice', props: { branding: platform, kind, agencyName: AGENCY, date: '2026-11-13', billingUrl: `${APP}/agency/settings/billing` } },
});
const clientBilling = (kind: ClientBillingNoticeKind): EmailPreview => ({
  id: `client_billing_notice.${kind}`, label: `Client billing notice: ${kind}`,
  payload: { template: 'client_billing_notice', props: { branding: agency, kind, agencyName: AGENCY, actionUrl: `${APP}/pay/abc` } },
});
const agencyClientBilling = (kind: AgencyClientBillingNoticeKind): EmailPreview => ({
  id: `agency_client_billing_notice.${kind}`, label: `Agency client billing notice: ${kind}`,
  payload: { template: 'agency_client_billing_notice', props: { branding: platform, kind, clientName: CLIENT, n: 7, until: 'November 1', billingUrl: `${APP}/c/1/settings/billing` } },
});
const spend = (kind: PlatformSpendAlertProps['kind']): EmailPreview => ({
  id: `platform_spend_alert.${kind}`, label: `Spend alert: ${kind}`,
  payload: { template: 'platform_spend_alert', props: { branding: platform, kind, title: `Spend alert for ${CLIENT}`, lines: ['Usage is at 130% of the monthly limit.'], url: `${APP}/platform/costs` } },
});
const ops = (checkpoint: PlatformOpsAlertProps['checkpoint'], severity: PlatformOpsAlertProps['severity']): EmailPreview => ({
  id: `platform_ops_alert.${checkpoint}.${severity}`, label: `Ops alert: ${checkpoint} (${severity})`,
  payload: { template: 'platform_ops_alert', props: { branding: platform, checkpoint, severity, deliveryDate: '2026-10-26', clients: [{ clientName: CLIENT, agencyName: AGENCY }], healthUrl: `${APP}/platform/health` } },
});
const tip = (day: 1 | 3 | 7, nextStep: OnboardingTipProps['nextStep']): EmailPreview => ({
  id: `onboarding_tip.day${day}.${nextStep}`, label: `Onboarding tip: day ${day}, next step ${nextStep}`,
  payload: { template: 'onboarding_tip', props: { branding: platform, agencyName: AGENCY, day, nextStep, url: `${APP}/agency`, unsubscribeUrl: `${APP}/unsubscribe/abc` } },
});

const terms = (basePriceCents: number, includedSeats: number, seatPriceCents: number): PlanTerms => ({ basePriceCents, includedSeats, seatPriceCents });
const planBase = { branding: platform, recipientName: 'Ann', agencyName: AGENCY, before: terms(22900, 3, 9900), after: terms(19900, 5, 7900), featuresAdded: [] as ('ask' | 'mcp')[], featuresRemoved: [] as ('ask' | 'mcp')[] };

const readyPreview: LeadPreview = {
  status: 'ready', self: { name: CLIENT, rating: 4.5, votes: 40 }, nearby: [{ name: 'Harbor Dental', rating: 4.8, votes: 120, distanceKm: 1.2 }],
  facts: ['3 of 5 nearby dentists have more reviews than you.', 'Your closest competitor is Harbor Dental, 1.2 km away.'], summary: 'You trail on review volume.', category: 'Dentist', generatedAt: '2026-10-17T00:00:00Z',
};
const lead = { businessName: CLIENT, contactName: 'Jordan Rivera', contactEmail: 'jordan@example.com' };

export const EMAIL_PREVIEWS: readonly EmailPreview[] = [
  // client-facing, agency-branded
  { id: 'alert', label: 'Competitor alert', payload: { template: 'alert', props: alertProps } },
  { id: 'alert.feedback', label: 'Competitor alert with feedback line', payload: { template: 'alert', props: { ...alertProps, feedback: sam } } },
  { id: 'alert.feedback_no_name', label: 'Competitor alert, feedback line without a name', payload: { template: 'alert', props: { ...alertProps, feedback: { email: 'hello@example.com', name: null } } } },
  { id: 'alert_digest', label: 'Alert digest', payload: { template: 'alert_digest', props: { branding: agency, recipientName: null, clientName: CLIENT, date: '2026-10-05', link: `${APP}/l/digest`, alerts: [1, 2, 3].map((n) => ({ competitorName: 'Harbor Dental', headline: `Headline ${n}`, body: `Body ${n}`, link: `${APP}/l/${n}` })) } } },
  { id: 'alert_digest.single', label: 'Alert digest, one alert', payload: { template: 'alert_digest', props: { branding: agency, recipientName: null, clientName: CLIENT, date: '2026-10-05', link: `${APP}/l/digest`, alerts: [{ competitorName: 'Harbor Dental', headline: 'Headline 1', body: 'Body 1', link: `${APP}/l/1` }] } } },
  { id: 'brief', label: 'Weekly brief', payload: { template: 'brief', props: brief } },
  { id: 'brief.feedback', label: 'Weekly brief with feedback line', payload: { template: 'brief', props: { ...brief, feedback: sam } } },
  { id: 'brief.quiet', label: 'Weekly brief, quiet week', payload: { template: 'brief', props: { ...brief, kind: 'quiet', summary: 'No significant competitor moves this week.', items: [] } } },
  { id: 'brief.quiet_scorecard', label: 'Weekly brief, quiet week with "Where you stand" scorecard', payload: { template: 'brief', props: { ...brief, kind: 'quiet', summary: 'No significant competitor moves this week.', items: [], scorecard } } },
  { id: 'brief.starting_point', label: 'Starting-point brief', payload: { template: 'brief', props: startingPoint } },
  { id: 'trend_report', label: 'Quarterly trend report', payload: { template: 'trend_report', props: report } },
  { id: 'sign_in', label: 'Sign-in link', payload: { template: 'sign_in', props: { branding: agency, url: `${APP}/sign-in/abc`, expiresMinutes: 15 } } },
  { id: 'client_invite', label: 'Client invite', payload: { template: 'client_invite', props: { branding: agency, businessName: CLIENT, agencyName: AGENCY, startUrl: `${APP}/sign-in?next=%2Fc%2F1%2Fsetup` } } },
  { id: 'competitor_review', label: 'Competitor review request', payload: { template: 'competitor_review', props: { branding: agency, businessName: CLIENT, competitorNames: ['Harbor Dental', 'Maple Family Dentistry', 'Riverside Smiles'], reviewUrl: `${APP}/review/abc` } } },
  clientBilling('client-payment-link'),
  clientBilling('client-payment-needed'),
  { id: 'lead_verify', label: 'Lead: confirm email', payload: { template: 'lead_verify', props: { branding: agency, businessName: CLIENT, verifyUrl: `${APP}/start/verify/abc` } } },
  { id: 'lead_confirmation.ready', label: 'Lead confirmation with snapshot', payload: { template: 'lead_confirmation', props: { branding: agency, businessName: CLIENT, agencyName: AGENCY, preview: readyPreview } } },
  { id: 'lead_confirmation.failed', label: 'Lead confirmation, snapshot failed', payload: { template: 'lead_confirmation', props: { branding: agency, businessName: CLIENT, agencyName: AGENCY, preview: { status: 'failed' } } } },
  { id: 'lead_confirmation.pool_ready', label: 'Lead confirmation, unassigned pool, with snapshot', payload: { template: 'lead_confirmation', props: { branding: platform, businessName: CLIENT, agencyName: null, preview: readyPreview } } },
  { id: 'lead_confirmation.pool_failed', label: 'Lead confirmation, unassigned pool, snapshot failed', payload: { template: 'lead_confirmation', props: { branding: platform, businessName: CLIENT, agencyName: null, preview: { status: 'failed' } } } },
  { id: 'lead_declined', label: 'Lead declined', payload: { template: 'lead_declined', props: { branding: agency, businessName: CLIENT, agencyName: AGENCY } } },
  // agency-facing, agency-branded
  { id: 'team_invite', label: 'Team invite', payload: { template: 'team_invite', props: { branding: agency, inviterName: PERSON, agencyName: AGENCY, roleLabel: 'Account manager', expiryDate: 'Nov 6, 2026', signInUrl: `${APP}/sign-in?email=sam%40example.com&next=%2Fagency` } } },
  { id: 'lead_new', label: 'New lead (agency)', payload: { template: 'lead_new', props: { branding: agency, ...lead, contactPhone: '555-0100', ref: 'flyer', leadsUrl: `${APP}/agency/leads`, pool: false } } },
  { id: 'lead_new.pool', label: 'New lead (platform pool)', payload: { template: 'lead_new', props: { branding: platform, ...lead, contactPhone: null, ref: null, leadsUrl: `${APP}/platform/leads`, pool: true } } },
  agencyNotice('am_alert', `New alert for ${CLIENT}`, ['Harbor Dental cut its cleaning price to $69.'], 'Open alert'),
  agencyNotice('brief_ready', `Brief ready for review: ${CLIENT}`, ['3 items.'], 'Review brief'),
  agencyNotice('brief_failed', `Brief failed: ${CLIENT}`, ['The weekly brief could not be generated.'], 'Open brief'),
  agencyNotice('brief_overdue', `Brief overdue: ${CLIENT}`, ['The brief has not been approved and is due today.'], 'Review brief'),
  agencyNotice('setup_suggestions_ready', `Competitor suggestions are ready for ${CLIENT}`, ['We found 5 businesses to review.'], 'Open setup'),
  agencyNotice('setup_client_changed', `${CLIENT} updated their setup`, ['They changed their competitor list.'], 'Open setup'),
  agencyNotice('setup_idle', `${CLIENT}'s setup is waiting on you`, ['Setup has been idle for 3 days.'], 'Open setup'),
  agencyNotice('rank_scan_skipped', `Local ranking scan skipped: ${CLIENT}`, ['The weekly scan did not run.'], 'Open rankings'),
  agencyNotice('contact_bounced', `Email bounced: ${CLIENT}`, ['jordan@example.com did not receive the last email.'], 'Open contacts'),
  // platform-branded (agency- or staff-facing)
  { id: 'sign_in.signup', label: 'Sign-in: confirm email for sign-up', payload: { template: 'sign_in', props: { branding: platform, url: `${APP}/sign-in/abc`, expiresMinutes: 15, signup: { agencyName: AGENCY } } } },
  { id: 'support_session_started', label: 'Support session opened', payload: { template: 'support_session_started', props: { branding: platform, recipientName: 'Ann', platformAdminName: 'Pat Platform', date: 'October 13, 2026', reason: 'Checking the brief setup' } } },
  { id: 'agency_hold.started', label: 'Agency hold started', payload: { template: 'agency_hold', props: { branding: platform, recipientName: 'Ann Admin', agencyName: AGENCY, kind: 'started', supportEmail: 'help@example.com' } } },
  { id: 'agency_hold.lifted', label: 'Agency hold lifted', payload: { template: 'agency_hold', props: { branding: platform, recipientName: null, agencyName: AGENCY, kind: 'lifted', supportEmail: 'help@example.com' } } },
  { id: 'platform_cost_low', label: 'Platform cost low', payload: { template: 'platform_cost_low', props: { branding: platform, label: 'OpenRouter', amountText: '$12.34', daysLeft: 5, billingUrl: 'https://billing.example.com', costsUrl: `${APP}/platform/costs` } } },
  { id: 'platform_cost_low.no_estimate', label: 'Platform cost low, no estimate or top-up link', payload: { template: 'platform_cost_low', props: { branding: platform, label: 'Search vendor', amountText: '7,099 credits', daysLeft: null, billingUrl: null, costsUrl: `${APP}/platform/costs` } } },
  spend('client_paused'),
  spend('spike_warn'),
  spend('spike_paused'),
  ops('generation_closed', 'warning'),
  ops('generation_closed', 'critical'),
  { id: 'platform_ops_alert.many', label: 'Ops alert: more clients than the list shows ("and N more")', payload: { template: 'platform_ops_alert', props: { branding: platform, checkpoint: 'generation_closed', severity: 'warning', deliveryDate: '2026-10-26', clients: Array.from({ length: 23 }, (_, i) => ({ clientName: `Demo Client ${i + 1}`, agencyName: AGENCY })), healthUrl: `${APP}/platform/health` } } },
  ops('pre_delivery', 'warning'),
  ops('pre_delivery_unapproved', 'warning'),
  ops('starting_point_late', 'warning'),
  ...BILLING_KINDS.map(billing),
  agencyClientBilling('client-payment-failed'),
  agencyClientBilling('client-paid'),
  agencyClientBilling('client-auto-paused'),
  agencyClientBilling('client_spend_paused'),
  agencyClientBilling('client-duplicate-subscription'),
  { id: 'agency_invite.trial', label: 'Agency invite, trial', payload: { template: 'agency_invite', props: { branding: platform, url: `${APP}/join/abc`, offer: 'trial', expiresAt: '2026-10-30' } } },
  { id: 'agency_invite.trial_discount', label: 'Agency invite, trial with discount', payload: { template: 'agency_invite', props: { branding: platform, url: `${APP}/join/abc`, offer: 'trial', discountText: '20% off the first 3 months', expiresAt: '2026-10-30' } } },
  { id: 'agency_invite.pilot', label: 'Agency invite, pilot', payload: { template: 'agency_invite', props: { branding: platform, url: `${APP}/join/abc`, offer: 'pilot', pilotEndsAt: '2026-12-31', expiresAt: '2026-10-30' } } },
  { id: 'agency_welcome', label: 'Agency welcome', payload: { template: 'agency_welcome', props: { branding: platform, agencyName: AGENCY, url: `${APP}/agency`, supportEmail: 'help@example.com' } } },
  tip(1, 'profile'), tip(1, 'team'), tip(1, 'plan'), tip(1, 'branding'), tip(1, 'first_client'), tip(3, 'first_client'), tip(7, 'first_client'),
  { id: 'platform_signup_notice.open_trial', label: 'Sign-up notice: open sign-up, trial', payload: { template: 'platform_signup_notice', props: { branding: platform, agencyName: AGENCY, contactName: PERSON, email: 'sam@example.com', source: 'open', offer: 'trial', consoleUrl: `${APP}/platform/agencies` } } },
  { id: 'platform_signup_notice.invite_pilot', label: 'Sign-up notice: invite link, pilot, no name', payload: { template: 'platform_signup_notice', props: { branding: platform, agencyName: AGENCY, contactName: null, email: 'sam@example.com', source: 'invite', offer: 'pilot', pilotEndsAt: '2026-12-31', consoleUrl: `${APP}/platform/agencies` } } },
  { id: 'waitlist_confirmation.agency', label: 'Waitlist confirmation, agency', payload: { template: 'waitlist_confirmation', props: { branding: platform, kind: 'agency', contactName: 'Ada', orgName: AGENCY, confirmUrl: `${APP}/waitlist/confirm/abc`, sampleBusinessName: null } } },
  { id: 'waitlist_confirmation.agency_sample', label: 'Waitlist confirmation, agency with sample brief request', payload: { template: 'waitlist_confirmation', props: { branding: platform, kind: 'agency', contactName: 'Ada', orgName: AGENCY, confirmUrl: `${APP}/waitlist/confirm/abc`, sampleBusinessName: CLIENT } } },
  { id: 'waitlist_confirmation.business', label: 'Waitlist confirmation, business', payload: { template: 'waitlist_confirmation', props: { branding: platform, kind: 'business', contactName: 'Ada', orgName: CLIENT, confirmUrl: `${APP}/waitlist/confirm/abc`, sampleBusinessName: null } } },
  { id: 'sample_brief_ready', label: 'Sample brief ready', payload: { template: 'sample_brief_ready', props: { branding: platform, contactName: 'Ada', businessName: CLIENT, url: `${APP}/sample/abc`, expiresAt: '2026-11-27' } } },
  { id: 'agency_plan_change.next_billing', label: 'Plan change, from a billing date', payload: { template: 'agency_plan_change', props: { ...planBase, effective: { kind: 'next_billing', date: '2026-11-03' } } } },
  { id: 'agency_plan_change.next_billing_no_date', label: 'Plan change, from the next billing date', payload: { template: 'agency_plan_change', props: { ...planBase, effective: { kind: 'next_billing', date: null } } } },
  { id: 'agency_plan_change.on_subscribe', label: 'Plan change, applies on subscribe', payload: { template: 'agency_plan_change', props: { ...planBase, effective: { kind: 'on_subscribe' } } } },
  { id: 'agency_plan_change.features', label: 'Plan change with features added and removed', payload: { template: 'agency_plan_change', props: { ...planBase, featuresAdded: ['ask'], featuresRemoved: ['mcp'], effective: { kind: 'next_billing', date: '2026-11-03' } } } },
];

export const DOCUMENT_PREVIEWS: readonly DocumentPreview[] = [
  { id: 'document.brief', label: 'Brief PDF', render: () => renderBriefDocument({ ...brief, link: null, pdfLink: null }) },
  { id: 'document.brief_starting_point', label: 'Starting-point brief PDF', render: () => renderBriefDocument({ ...startingPoint, link: null, pdfLink: null }) },
  { id: 'document.trend_report', label: 'Trend report PDF', render: () => renderTrendReportDocument({ ...report, link: null }) },
];
