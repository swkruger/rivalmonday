import type { PlanFeature } from '@cs/core';
import type { LeadPreview, OnboardingStep, TrendReportData, TrendSnapshot } from '@cs/db';
import type { Branding } from './branding';

/** 7c2: who a client writes to about a brief or alert (the AM, else the agency admin: `replyToFor`). */
export interface FeedbackContact {
  email: string;
  name: string | null;
}
interface Base {
  branding: Branding;
  recipientName: string | null;
  clientName: string;
}
export interface AlertEmailProps extends Base {
  competitorName: string;
  headline: string;
  body: string;
  /** YYYY-MM-DD, client-local. */
  detectedOn: string;
  link: string;
  /** 7c2: the feedback line; hidden when absent or null. */
  feedback?: FeedbackContact | null;
}
export interface DigestEmailProps extends Base {
  date: string;
  alerts: { competitorName: string; headline: string; body: string; link: string }[];
  link: string;
}
export interface AgencyNoticeProps extends Base {
  notice: 'am_alert' | 'brief_ready' | 'brief_failed' | 'brief_overdue' | 'setup_suggestions_ready' | 'setup_client_changed' | 'setup_idle' | 'rank_scan_skipped' | 'contact_bounced';
  title: string;
  lines: string[];
  link: string;
  actionLabel: string;
}
/** A client-facing brief item: there is deliberately no upsell field (spec §8.5 — agency-only). */
export interface BriefEmailItem {
  /** 'self' = about the client's own business: no competitor name is shown. */
  subject?: 'self' | 'competitor';
  competitorName: string;
  headline: string;
  whatChanged: string;
  whyItMatters: string;
  recommendedAction: string;
  effort: 'L' | 'M' | 'H';
  impact: 'L' | 'M' | 'H';
  link: string | null;
}
/** The one formatted view of a scorecard (built by `scorecardModel` in @cs/engine) rendered by web, email and PDF. All strings are display-ready. */
export interface ScorecardModel {
  tiles: { label: string; value: string; sub: string; trend: 'up' | 'down' | null; trendText: string | null }[];
  table: { headers: string[]; rows: { cells: string[]; self: boolean; tier: 'top' | 'watch' | 'minor' | null }[] };
  openFirstMoves: string[];
}
export interface BriefEmailProps extends Base {
  deliveryDate: string;
  kind: 'standard' | 'quiet' | 'starting_point';
  summary: string;
  items: BriefEmailItem[];
  trend: TrendSnapshot | null;
  /** Starting point and quiet weeks; null otherwise. */
  scorecard?: ScorecardModel | null;
  /** Null in the PDF variant. */
  link: string | null;
  pdfLink: string | null;
  signOff: string | null;
  /** 7c2: the feedback line; hidden when absent or null and never in the PDF variant. */
  feedback?: FeedbackContact | null;
}
export interface TrendReportEmailProps extends Base {
  quarter: string;
  data: TrendReportData;
  link: string | null;
  pdfLink: string | null;
}
export interface SignInEmailProps {
  branding: Branding;
  url: string;
  expiresMinutes: number;
  /** Phase 10: an open agency sign-up for this address; switches the wording to "confirm your email". */
  signup?: { agencyName: string };
}
export interface SupportSessionStartedProps {
  branding: Branding;
  recipientName: string | null;
  platformAdminName: string;
  /** Human-readable date, e.g. "October 13, 2026". */
  date: string;
  reason: string;
}
/** 15c-3a: the platform tells an agency's admins its account was put on hold / the hold was lifted (no reason, ever). */
export interface AgencyHoldProps {
  branding: Branding;
  recipientName: string | null;
  agencyName: string;
  kind: 'started' | 'lifted';
  supportEmail: string;
}
/** 15c-3b: one plan version's price terms (cents). */
export type PlanTerms = { basePriceCents: number; includedSeats: number; seatPriceCents: number };
/** 15c-3b: the platform tells an agency's admins its plan is changing (moved to the current standard version). */
export interface AgencyPlanChangeProps {
  branding: Branding;
  recipientName: string | null;
  agencyName: string;
  before: PlanTerms;
  after: PlanTerms;
  featuresAdded: PlanFeature[];
  featuresRemoved: PlanFeature[];
  /** `date` is date-only UTC (YYYY-MM-DD); null reads "your next billing date". */
  effective: { kind: 'next_billing'; date: string | null } | { kind: 'on_subscribe' };
}
/** 7b1: staff alert for a client spend pause or a platform spike (USD allowed: platform staff only). */
export interface PlatformSpendAlertProps {
  branding: Branding;
  kind: 'client_paused' | 'spike_warn' | 'spike_paused';
  title: string;
  lines: string[];
  url: string;
}
/** 7c2: staff alert when a weekly brief or starting point is not ready in time (platform staff only). */
export interface PlatformOpsAlertProps {
  branding: Branding;
  checkpoint: 'generation_closed' | 'pre_delivery' | 'pre_delivery_unapproved' | 'starting_point_late';
  severity: 'warning' | 'critical';
  deliveryDate: string;
  clients: { clientName: string; agencyName: string }[];
  healthUrl: string;
}
export interface PlatformCostLowProps {
  branding: Branding;
  label: string;
  /** Already formatted, e.g. "$12.34" or "7,099 credits". */
  amountText: string;
  daysLeft: number | null;
  billingUrl: string | null;
  costsUrl: string;
}
export type BillingNoticeKind =
  | 'trial_started'
  | 'trial_ending_7'
  | 'trial_ending_1'
  | 'trial_ended'
  | 'payment_failed'
  | 'service_paused'
  | 'account_suspended'
  | 'account_reactivated'
  | 'pilot_ending_7';
export interface BillingNoticeProps {
  /** Always Rival Monday branding (platform billing, not the agency's white label). */
  branding: Branding;
  kind: BillingNoticeKind;
  agencyName: string;
  /** ISO timestamp/date or an already human-readable date; rendered as e.g. "November 13, 2026" (UTC). */
  date?: string;
  billingUrl: string;
}
/** 15c-2a D7: an agency-role (admin / account manager) invitation; sent directly, not via the outbox (B1). */
export interface TeamInviteProps {
  branding: Branding;
  /** The inviter's name, or their email when they have none. */
  inviterName: string;
  agencyName: string;
  /** e.g. "Agency admin", "Account manager". */
  roleLabel: string;
  /** Already formatted, e.g. "Nov 6, 2026" (UTC, year always shown). */
  expiryDate: string;
  /** `/sign-in?email=…&next=/agency`; carries the address, so never log it. */
  signInUrl: string;
}
export interface ClientInviteProps {
  branding: Branding;
  businessName: string;
  agencyName: string;
  startUrl: string;
}

/** 1..5 names only; never carries suggestion-internal fields. */
export interface CompetitorReviewProps {
  branding: Branding;
  businessName: string;
  competitorNames: string[];
  reviewUrl: string;
}

export type ClientBillingNoticeKind = 'client-payment-link' | 'client-payment-needed';
/** Phase 9b Task 8: client-facing, agency-branded. Never mentions the platform. */
export interface ClientBillingNoticeProps {
  branding: Branding;
  kind: ClientBillingNoticeKind;
  agencyName: string;
  /** The button target: the Stripe Checkout link (client-payment-link) or the client's billing page (client-payment-needed). */
  actionUrl: string;
}
export type AgencyClientBillingNoticeKind = 'client-payment-failed' | 'client-paid' | 'client-auto-paused' | 'client_spend_paused' | 'client-duplicate-subscription';
/** Phase 9b Task 8: agency admins, Rival Monday branding. */
export interface AgencyClientBillingNoticeProps {
  branding: Branding;
  kind: AgencyClientBillingNoticeKind;
  clientName: string;
  /** Days without payment (client-auto-paused). */
  n?: number;
  /** Spend pause (7b1): the date AI work resumes, e.g. "November 1". */
  until?: string;
  /** The button target: client billing, or the usage page for `client_spend_paused`. */
  billingUrl: string;
}
/** Phase 10 Task 11: all four are Rival Monday branded (platform, not white label). */
export interface AgencyInviteProps {
  branding: Branding;
  /** The redeem link; contains the raw token, so never log it. */
  url: string;
  offer: 'trial' | 'pilot';
  /** ISO date/timestamp; shown only for a pilot. */
  pilotEndsAt?: string;
  /** Trial line extension, e.g. "20% off the first 3 months". */
  discountText?: string;
  /** ISO timestamp/date; rendered as e.g. "October 30, 2026" (UTC). */
  expiresAt: string;
}
export interface AgencyWelcomeProps {
  branding: Branding;
  agencyName: string;
  url: string;
  /** 7c2: where pilot agencies write to us (`SUPPORT_REPLY_TO`, else support@rivalmonday.app). */
  supportEmail: string;
}
export interface OnboardingTipProps {
  branding: Branding;
  agencyName: string;
  day: 1 | 3 | 7;
  nextStep: OnboardingStep | 'first_client';
  url: string;
  unsubscribeUrl: string;
}
export interface PlatformSignupNoticeProps {
  branding: Branding;
  agencyName: string;
  /** Null or blank when sign-up gave no name; the notice then shows the email alone. */
  contactName: string | null;
  email: string;
  source: 'open' | 'invite';
  offer: 'trial' | 'pilot';
  pilotEndsAt?: string;
  consoleUrl: string;
}
/** Phase 11c Task 30: lead mail. Agency leads use agency branding; unassigned pool leads use Rival Monday branding. */
export interface LeadVerifyProps {
  branding: Branding;
  businessName: string;
  /** Contains the raw verify token, so never log it. */
  verifyUrl: string;
}
/** Phase 17a: pilot waitlist confirmation. Always platform-branded. `confirmUrl` holds the raw token, so never log it. */
export interface WaitlistConfirmationProps {
  branding: Branding;
  kind: 'agency' | 'business';
  contactName: string;
  orgName: string;
  confirmUrl: string;
  sampleBusinessName: string | null;
}
/** Phase 17a: the sample-brief link mail. Always platform-branded. `url` holds the signed token, so never log it. */
export interface SampleBriefReadyProps {
  branding: Branding;
  contactName: string;
  businessName: string;
  url: string;
  /** ISO timestamp; rendered as e.g. "November 27, 2026" (UTC). */
  expiresAt: string;
}
export interface LeadConfirmationProps {
  branding: Branding;
  businessName: string;
  /** Null for an unassigned platform-pool lead (platform wording). */
  agencyName: string | null;
  preview: LeadPreview;
}
export interface LeadDeclinedProps {
  branding: Branding;
  businessName: string;
  agencyName: string;
}
export interface LeadNewProps {
  branding: Branding;
  businessName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  ref: string | null;
  /** The /agency/leads or /platform/leads link. */
  leadsUrl: string;
  /** True for the platform pool notice. */
  pool: boolean;
}
export type EmailPayload =
  | { template: 'alert'; props: AlertEmailProps }
  | { template: 'alert_digest'; props: DigestEmailProps }
  | { template: 'agency_notice'; props: AgencyNoticeProps }
  | { template: 'brief'; props: BriefEmailProps }
  | { template: 'trend_report'; props: TrendReportEmailProps }
  | { template: 'sign_in'; props: SignInEmailProps }
  | { template: 'support_session_started'; props: SupportSessionStartedProps }
  | { template: 'agency_hold'; props: AgencyHoldProps }
  | { template: 'platform_cost_low'; props: PlatformCostLowProps }
  | { template: 'platform_spend_alert'; props: PlatformSpendAlertProps }
  | { template: 'platform_ops_alert'; props: PlatformOpsAlertProps }
  | { template: 'billing_notice'; props: BillingNoticeProps }
  | { template: 'client_invite'; props: ClientInviteProps }
  | { template: 'team_invite'; props: TeamInviteProps }
  | { template: 'competitor_review'; props: CompetitorReviewProps }
  | { template: 'client_billing_notice'; props: ClientBillingNoticeProps }
  | { template: 'agency_client_billing_notice'; props: AgencyClientBillingNoticeProps }
  | { template: 'agency_invite'; props: AgencyInviteProps }
  | { template: 'agency_welcome'; props: AgencyWelcomeProps }
  | { template: 'onboarding_tip'; props: OnboardingTipProps }
  | { template: 'platform_signup_notice'; props: PlatformSignupNoticeProps }
  | { template: 'lead_verify'; props: LeadVerifyProps }
  | { template: 'lead_confirmation'; props: LeadConfirmationProps }
  | { template: 'waitlist_confirmation'; props: WaitlistConfirmationProps }
  | { template: 'sample_brief_ready'; props: SampleBriefReadyProps }
  | { template: 'lead_declined'; props: LeadDeclinedProps }
  | { template: 'lead_new'; props: LeadNewProps }
  | { template: 'agency_plan_change'; props: AgencyPlanChangeProps };
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}
