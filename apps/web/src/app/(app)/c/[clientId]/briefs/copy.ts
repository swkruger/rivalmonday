/** Briefs & reports tabs (15a §2.8): URL `?tab=` values and labels; the empty states are help copy (`PAGE_COPY['client.briefs']`). */
export type BriefsTab = 'briefs' | 'alerts' | 'reports';

export const TABS: { key: BriefsTab; label: string }[] = [
  { key: 'briefs', label: 'Weekly briefs' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'reports', label: 'Quarterly reports' },
];

