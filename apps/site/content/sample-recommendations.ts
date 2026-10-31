/**
 * The Recommendations board on the sample (owner signs). Titles, reasons and evidence come from `sample-brief.json`'s items,
 * so the board and the brief always agree; effort, impact, who does it and the starting column are invented for the sample,
 * like the tour's KPIs, and labelled "Sample data". Mirrors apps/web `recommendation-board.tsx`, client view (no upsell tags).
 */
export type RecStatus = 'todo' | 'in_progress' | 'done' | 'dismissed';
export type RecLevel = 'Low' | 'Medium' | 'High';

export const SAMPLE_REC_META: Record<string, { status: RecStatus; effort: RecLevel; impact: RecLevel; owner: 'client' | 'agency' }> = {
  i1: { status: 'todo', effort: 'Medium', impact: 'High', owner: 'agency' },
  i2: { status: 'in_progress', effort: 'Low', impact: 'Medium', owner: 'client' },
  i3: { status: 'todo', effort: 'Low', impact: 'Medium', owner: 'agency' },
  i4: { status: 'done', effort: 'Low', impact: 'Medium', owner: 'client' },
};

export const REC_COPY = {
  columns: { todo: 'To do', in_progress: 'In progress', done: 'Done' },
  owner: { client: 'For you', agency: 'Agency' },
  source: 'From weekly brief',
  empty: 'Nothing here yet.',
  dismissTitle: (title: string) => `Dismiss “${title}”?`,
  dismissBody: 'A reason is required. It helps tune future recommendations.',
  reasonLabel: 'Reason',
  dismissedLabel: (n: number) => `${n} dismissed`,
  note: 'Sample data. Try the buttons: changes stay in this page and nothing is saved.',
  reset: 'Reset the board',
} as const;
