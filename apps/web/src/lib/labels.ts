import type { Role } from '@cs/core';
import type { AGENCY_KINDS, AlertStatus, BriefStatus, LeadStatus, BillingState, ClientStatus, EvidenceKind, WebhookKind, TrendReportStatus, askMessage, prospectReport } from '@cs/db';
import type { CatalogStatus } from '@cs/verticals';
import type { ChipTone } from '@cs/ui';

/**
 * Plain-word labels and chip tones for every enum the UI shows (15c-1 spec 3.2). Tone rule: success = healthy or finished
 * well; info = in progress or time-boxed; warning = needs someone; danger = blocked or failed; neutral = everything else.
 * Keys come from the DB const arrays / unions where one exists, so a new value is a type error until it is labelled.
 * Copy is sentence case and goes through the owner's sign-off.
 */
export interface LabelEntry { label: string; tone: ChipTone }
export type LabelMap<T extends string> = Record<T, LabelEntry>;

type AskMessageStatus = (typeof askMessage.$inferSelect)['status'];
type ProspectReportStatus = (typeof prospectReport.$inferSelect)['status'];

const e = (label: string, tone: ChipTone = 'neutral'): LabelEntry => ({ label, tone });

export function sentenceCase(value: string): string {
  const s = value.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return s ? s[0]!.toUpperCase() + s.slice(1) : '—';
}

/** Label + tone for a value; an unlabelled value falls back to sentence case (neutral), an empty one to an em dash. */
export function labelFor<T extends string>(map: LabelMap<T>, value: T | string | null | undefined): LabelEntry {
  if (value == null || value === '') return e('—');
  return (map as Record<string, LabelEntry>)[value] ?? e(sentenceCase(value));
}

// BILLING_STATES (packages/db/src/schema/billing.ts)
export const BILLING_STATE: LabelMap<BillingState> = {
  pilot: e('Pilot', 'info'),
  trialing: e('Free trial', 'info'),
  active: e('Active', 'success'),
  past_due: e('Payment overdue', 'warning'),
  read_only: e('Read-only', 'danger'),
  suspended: e('Suspended', 'danger'),
  cancelled: e('Cancelled', 'danger'),
};

// CLIENT_STATUSES (packages/db/src/schema/tenancy.ts)
export const CLIENT_STATUS: LabelMap<ClientStatus> = {
  active: e('Active', 'success'),
  prospect: e('Prospect'),
};

// LeadStatus (packages/db/src/schema/leads.ts)
export const LEAD_STATUS: LabelMap<LeadStatus> = {
  unverified: e('Not verified yet', 'info'),
  verified: e('Verified', 'info'),
  accepted: e('Accepted', 'success'),
  declined: e('Declined', 'danger'),
  expired: e('Expired'),
};

// ALERT_STATUSES (packages/db/src/schema/delivery.ts)
export const ALERT_STATUS: LabelMap<AlertStatus> = {
  drafting: e('Being drafted', 'info'),
  pending_review: e('Waiting for review', 'warning'),
  approved: e('Approved', 'success'),
  delivered: e('Sent', 'success'),
  dismissed: e('Dismissed'),
  withdrawn: e('Withdrawn'),
  expired: e('Expired'),
};

// vertical / business-area catalogue review state (CatalogStatus, @cs/verticals)
export const REVIEW_STATUS: LabelMap<CatalogStatus> = {
  reviewed: e('Reviewed', 'success'),
  unreviewed: e('Needs review', 'warning'),
  merged: e('Merged'),
};

// TREND_REPORT_STATUSES (delivery.ts) and the prospect_report status column type (client-intel.ts)
export const REPORT_STATUS: LabelMap<TrendReportStatus | ProspectReportStatus> = {
  running: e('Preparing', 'info'),
  ready: e('Ready', 'success'),
  sent: e('Sent', 'success'),
  failed: e('Failed', 'danger'),
};

// BriefStatus (packages/db/src/schema/briefs.ts); the approvals queue and the review page
export const BRIEF_STATUS: LabelMap<BriefStatus> = {
  generating: e('Drafting', 'info'),
  ready: e('Ready for review', 'warning'),
  approved: e('Approved', 'success'),
  sent: e('Sent', 'success'),
  failed: e('Failed — retrying', 'danger'),
};

// ask message status (packages/db/src/schema/ask.ts $type)
export const ASK_MESSAGE_STATUS: LabelMap<AskMessageStatus> = {
  ok: e('Answered', 'success'),
  quota: e('Limit reached', 'warning'),
  refused: e("Couldn't answer", 'danger'),
  error: e('Something went wrong', 'danger'),
  cancelled: e('Stopped'),
};

// EVIDENCE_KINDS (packages/db/src/schema/evidence.ts)
export const EVIDENCE_KIND: LabelMap<EvidenceKind> = {
  html: e('Saved page'),
  text: e('Page text'),
  screenshot: e('Screenshot'),
  vendor_json: e('Source data'),
};

// WEBHOOK_KINDS (packages/db/src/schema/delivery.ts)
export const WEBHOOK_KIND: LabelMap<WebhookKind> = {
  slack: e('Slack'),
  teams: e('Microsoft Teams'),
};

// AGENCY_KINDS (packages/db/src/schema/delivery.ts): agency notices a Slack/Teams webhook can carry
export const AGENCY_NOTICE_KIND: LabelMap<(typeof AGENCY_KINDS)[number]> = {
  am_alert: e('Client alerts (agency)'),
  brief_ready: e('Brief ready for review'),
  brief_failed: e('Brief failed'),
  brief_overdue: e('Brief overdue'),
  setup_suggestions_ready: e('Competitor suggestions ready'),
  setup_client_changed: e('Client updated their setup'),
  setup_idle: e('Setup waiting on you'),
  trend_report: e('Quarterly report'),
  rank_scan_skipped: e('Rank scan skipped'),
  contact_bounced: e('Contact bouncing'),
};

// ROLES (packages/core/src/access.ts); wording matches the team page / invite form
export const MEMBERSHIP_ROLE: LabelMap<Role> = {
  agency_admin: e('Agency admin'),
  account_manager: e('Account manager'),
  client_owner: e('Client owner'),
  client_viewer: e('Client viewer'),
};

// AgencyHealth (packages/tools/src/platform/health.ts); platform console only
export const AGENCY_HEALTH: LabelMap<'at_risk' | 'idle' | 'growing' | 'steady'> = {
  at_risk: e('At risk', 'danger'),
  idle: e('Idle', 'warning'),
  growing: e('Growing', 'success'),
  steady: e('Steady', 'info'),
};

// PlatformHealth status (packages/tools/src/platform/system-health.ts: ok / warn / down); platform console only
export const HEALTH_STATUS: LabelMap<'ok' | 'warn' | 'down'> = {
  ok: e('Working', 'success'),
  warn: e('Slow', 'warning'),
  down: e('Down', 'danger'),
};

// Stripe invoice status (packages/tools/src/tools/platform-billing.ts passes it through); platform console only
export const INVOICE_STATUS: LabelMap<'draft' | 'open' | 'paid' | 'uncollectible' | 'void'> = {
  draft: e('Draft'),
  open: e('Open', 'info'),
  paid: e('Paid', 'success'),
  uncollectible: e('Uncollectible', 'danger'),
  void: e('Voided'),
};

// REASONS (packages/billing/src/state.ts), written to agency_billing_event.reason; platform console only
export const BILLING_EVENT_REASON: Record<string, string> = {
  'signal:subscription_active': 'Subscription started',
  'signal:payment_failed': 'Payment failed',
  'signal:subscription_ended': 'Subscription ended',
  'signal:cancel_at_period_end': 'Set to cancel at period end',
  'timer:trial_ended': 'Free trial ended',
  'timer:past_due_7d': 'Payment overdue for 7 days',
  'timer:read_only_37d': 'Read-only for 30 days',
  'timer:review_127d': 'Suspended for 90 days',
  'timer:pilot_ended': 'Pilot ended',
  'timer:cancel_at_reached': 'Cancellation date reached',
  'admin:grant_pilot': 'Pilot granted by staff',
  'admin:end_pilot': 'Pilot ended by staff',
  'admin:extend_trial': 'Trial extended by staff',
};

/** Plain-words reason for a billing event; an unknown one drops its "signal:" / "timer:" / "admin:" prefix and falls back to sentence case. */
export const billingReasonLabel = (reason: string): string => BILLING_EVENT_REASON[reason] ?? sentenceCase(reason.replace(/^[a-z]+:/, ''));

// topic_proposal.status (TopicProposalView, list_topic_proposals): platform console only
export const TOPIC_PROPOSAL_STATUS: LabelMap<'proposed' | 'approved' | 'rejected'> = {
  proposed: e('Waiting for review', 'warning'),
  approved: e('Approved', 'success'),
  rejected: e('Rejected'),
};

// KB article status (list_kb_articles): platform console only
export const KB_ARTICLE_STATUS: LabelMap<'draft' | 'published'> = {
  draft: e('Draft'),
  published: e('Published', 'success'),
};

/** Maps whose labels can render to client roles; the terminology test scans these for agency-only words. */
export const CLIENT_AUDIENCE_MAPS: readonly LabelMap<string>[] = [ALERT_STATUS, REPORT_STATUS, ASK_MESSAGE_STATUS, EVIDENCE_KIND, MEMBERSHIP_ROLE];

// spend_guard_event.kind (packages/db/src/schema/platform.ts check constraint; 7b1, platform only)
type SpendGuardEventKind = 'client_reached' | 'client_paused' | 'client_unpaused' | 'spike_warn' | 'spike_paused' | 'spike_reset';
export const SPEND_GUARD_EVENT_KIND: LabelMap<SpendGuardEventKind> = {
  client_reached: e('Client reached limit', 'info'),
  client_paused: e('Client paused', 'warning'),
  client_unpaused: e('Client resumed', 'success'),
  spike_warn: e('Spike warning', 'info'),
  spike_paused: e('Spike pause', 'danger'),
  spike_reset: e('Guard reset', 'success'),
};
