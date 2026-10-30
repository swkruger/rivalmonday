/**
 * Sample data for the "What your clients see" tour (owner signs). Fictional, like `sample-brief.json`, and kept
 * consistent with it: every rival move here is one the sample brief carries; the KPI numbers, ad counts, pressure
 * scores and rating are invented for the sample and labelled "Sample data" wherever they show.
 */
export type PressureLevel = 'low' | 'elevated' | 'high';

export const CLIENT_VIEW = {
  tabs: { dashboard: 'Dashboard', brief: 'Monday brief', friday: 'Friday' },
  /** What to notice on each tab: three numbered notes under the window. */
  notes: {
    dashboard: [
      { title: 'The week in four numbers', body: 'Changes, price moves, rival ads and the rating against the area.' },
      { title: 'Who is pressing hardest', body: 'Each rival is scored on what it did lately, with the reason underneath.' },
      { title: 'Trends, not snapshots', body: 'Twelve weeks of rival ad activity, kept as evidence.' },
    ],
    brief: [
      { title: 'Under your name', body: 'Your agency name and logo on every brief.' },
      { title: 'What changed and what to do', body: 'Each move comes with why it matters and a recommended action.' },
      { title: 'One click to the evidence', body: 'The full brief links every line to the capture behind it.' },
    ],
    friday: [
      { title: 'Your name for it', body: 'Friday runs under the name you choose.' },
      { title: 'Answers from the evidence', body: 'Friday answers from the same evidence as the brief.' },
      { title: 'Sources on every answer', body: 'Numbered sources sit under each answer.' },
    ],
  },
  /** Stand-ins for the agency's own brand: the tour never shows Rival Monday inside the client's view. */
  agency: { logo: 'Your logo', name: 'Your agency', emailFrom: 'briefs@youragency.example' },
  nav: ['Overview', 'Monday briefs', 'Competitors', 'Map rankings', 'Ads', 'Reviews'],
  kpis: [
    { label: 'Changes this week', value: 4, decimals: 0, caption: 'across 3 rivals' },
    { label: 'Competitor price moves', value: 1, decimals: 0, caption: 'Kestrel Mechanical' },
    { label: 'Active competitor ads', value: 5, decimals: 0, caption: '12-week high' },
    { label: 'Your rating vs area', value: 4.8, decimals: 1, caption: 'area average 4.5' },
  ],
  pressure: [
    { name: 'Quillstone Climate Pros', score: 78, level: 'high', reason: 'Top 3 at 31 of 49 map points, up from 8' },
    { name: 'Juniperwell Air Works', score: 52, level: 'elevated', reason: '2 active ads for the last 4 weeks' },
    { name: 'Kestrel Mechanical', score: 44, level: 'elevated', reason: 'Cut its AC repair diagnostic to $69' },
    { name: 'Tidewell Mechanical', score: 31, level: 'low', reason: 'Added heat pump installation' },
  ] satisfies { name: string; score: number; level: PressureLevel; reason: string }[],
  /** Active ads per week over the sample's 12 scan weeks (Quillstone's 2 Meta ads were first seen Oct 7). */
  ads: [
    { name: 'Quillstone Climate Pros', role: 'rival1', points: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2] },
    { name: 'Juniperwell Air Works', role: 'rival2', points: [1, 1, 1, 2, 2, 2, 1, 1, 2, 2, 2, 2] },
    { name: 'Other rivals', role: 'context', points: [1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1] },
  ] satisfies { name: string; role: 'rival1' | 'rival2' | 'context'; points: number[] }[],
  alerts: [
    { title: 'Quillstone Climate Pros moved into the map top 3 at 31 of 49 points', date: '2026-10-13' },
    { title: 'Kestrel Mechanical cut its AC repair diagnostic to $69', date: '2026-10-09' },
    { title: 'Quillstone Climate Pros started 2 Meta ads', date: '2026-10-07' },
  ],
  email: {
    subjectLead: 'Your Monday brief',
    greeting: 'Good morning. Here is what your competitors did last week.',
    button: 'Open the full brief',
    pdf: 'PDF version',
    footer: 'You get this brief every Monday.',
  },
  friday: {
    placeholder: 'Ask about any rival…',
    sourcesLabel: 'Sources',
  },
} as const;
