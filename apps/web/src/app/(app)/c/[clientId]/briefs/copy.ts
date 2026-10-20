/** Briefs & reports tabs (15a §2.8): URL `?tab=` values and labels; the empty states are help copy (`PAGE_COPY['client.briefs']`). */
export type BriefsTab = 'briefs' | 'alerts' | 'reports';

export const TABS: { key: BriefsTab; label: string }[] = [
  { key: 'briefs', label: 'Weekly briefs' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'reports', label: 'Quarterly reports' },
];

/** Status chips (agency roles only). Brief wording matches the Approvals queue. */
export const BRIEF_STATUS: Record<string, string> = { generating: 'Drafting', failed: 'Failed — retrying', ready: 'Needs review', approved: 'Approved', sent: 'Sent' };
export const ALERT_STATUS: Record<string, string> = {
  drafting: 'Drafting', pending_review: 'Needs review', approved: 'Approved', delivered: 'Sent', dismissed: 'Dismissed', withdrawn: 'Withdrawn', expired: 'Expired',
};
export const REPORT_STATUS: Record<string, string> = { ready: 'Ready', sent: 'Sent' };
