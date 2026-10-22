import type { Role } from '@cs/core';
import type { BillingState, ClientStatus } from '@cs/db';
import type { ChipTone } from '@cs/ui';

/**
 * Plain-word labels and chip tones for every enum the UI shows (15c-1 spec 3.2). Tone rule: success = healthy or finished
 * well; info = in progress or time-boxed; warning = needs someone; danger = blocked or failed; neutral = everything else.
 * Keys come from the DB const arrays / unions where one exists, so a new value is a type error until it is labelled.
 * Copy is sentence case and goes through the owner's sign-off.
 */
export interface LabelEntry { label: string; tone: ChipTone }
export type LabelMap<T extends string> = Record<T, LabelEntry>;

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
export const LEAD_STATUS: LabelMap<'unverified' | 'verified' | 'accepted' | 'declined' | 'expired'> = {
  unverified: e('Not verified yet', 'info'),
  verified: e('Verified', 'info'),
  accepted: e('Accepted', 'success'),
  declined: e('Declined', 'danger'),
  expired: e('Expired'),
};

// alert.status CHECK (packages/db/src/schema/delivery.ts; the column is a plain string, so the union is typed here)
export const ALERT_STATUS: LabelMap<'drafting' | 'pending_review' | 'approved' | 'delivered' | 'dismissed' | 'withdrawn' | 'expired'> = {
  drafting: e('Being drafted', 'info'),
  pending_review: e('Waiting for review', 'warning'),
  approved: e('Approved', 'success'),
  delivered: e('Sent', 'success'),
  dismissed: e('Dismissed'),
  withdrawn: e('Withdrawn'),
  expired: e('Expired'),
};

// vertical / business-area catalogue review state (catalog.ts status CHECK; plain string column, union typed here)
export const REVIEW_STATUS: LabelMap<'reviewed' | 'unreviewed' | 'merged'> = {
  reviewed: e('Reviewed', 'success'),
  unreviewed: e('Needs review', 'warning'),
  merged: e('Merged'),
};

// trend_report ('ready' | 'sent') and prospect_report ('running' | 'ready' | 'failed') statuses
export const REPORT_STATUS: LabelMap<'running' | 'ready' | 'sent' | 'failed'> = {
  running: e('Preparing', 'info'),
  ready: e('Ready', 'success'),
  sent: e('Sent', 'success'),
  failed: e('Failed', 'danger'),
};

// ask message status (packages/db/src/schema/ask.ts $type)
export const ASK_MESSAGE_STATUS: LabelMap<'ok' | 'quota' | 'refused' | 'error' | 'cancelled'> = {
  ok: e('Answered', 'success'),
  quota: e('Limit reached', 'warning'),
  refused: e("Couldn't answer", 'danger'),
  error: e('Something went wrong', 'danger'),
  cancelled: e('Stopped'),
};

// evidence artifact kind (packages/db/src/schema/evidence.ts; plain string column)
export const EVIDENCE_KIND: LabelMap<'html' | 'text' | 'screenshot' | 'vendor_json'> = {
  html: e('Saved page'),
  text: e('Page text'),
  screenshot: e('Screenshot'),
  vendor_json: e('Source data'),
};

// agency_webhook.kind CHECK (packages/db/src/schema/delivery.ts)
export const WEBHOOK_KIND: LabelMap<'slack' | 'teams'> = {
  slack: e('Slack'),
  teams: e('Microsoft Teams'),
};

// ROLES (packages/core/src/access.ts); wording matches the team page / invite form
export const MEMBERSHIP_ROLE: LabelMap<Role> = {
  agency_admin: e('Admin'),
  account_manager: e('Account manager'),
  client_owner: e('Client owner'),
  client_viewer: e('Client viewer'),
};

/** Maps whose labels can render to client roles; the terminology test scans these for agency-only words. */
export const CLIENT_AUDIENCE_MAPS: readonly LabelMap<string>[] = [ALERT_STATUS, REPORT_STATUS, ASK_MESSAGE_STATUS, EVIDENCE_KIND, MEMBERSHIP_ROLE];
