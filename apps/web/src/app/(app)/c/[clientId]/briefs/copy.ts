/** Briefs & reports tabs (15a §2.8): URL `?tab=` values, labels and empty states (decided copy). */
export type BriefsTab = 'briefs' | 'alerts' | 'reports';

export const TABS: { key: BriefsTab; label: string }[] = [
  { key: 'briefs', label: 'Weekly briefs' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'reports', label: 'Quarterly reports' },
];

export const EMPTY: Record<BriefsTab, string> = {
  briefs: 'No weekly briefs yet. The first one arrives the Monday after setup is complete.',
  alerts: 'No alerts yet. Alerts are sent when a competitor makes an urgent change.',
  reports: 'No quarterly reports yet.',
};

/** Status chips (agency roles only). Brief wording matches the Approvals queue. */
export const BRIEF_STATUS: Record<string, string> = { generating: 'Drafting', failed: 'Failed — retrying', ready: 'Needs review', approved: 'Approved', sent: 'Sent' };
export const ALERT_STATUS: Record<string, string> = {
  drafting: 'Drafting', pending_review: 'Needs review', approved: 'Approved', delivered: 'Sent', dismissed: 'Dismissed', withdrawn: 'Withdrawn', expired: 'Expired',
};
export const REPORT_STATUS: Record<string, string> = { ready: 'Ready', sent: 'Sent' };
