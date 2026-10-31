/**
 * Sample data for the "What your clients see" tour (owner signs). Fictional, like `sample-brief.json`, and kept
 * consistent with it: every rival move here is one the sample brief carries; the KPI numbers, ad counts, pressure
 * scores and rating are invented for the sample and labelled "Sample data" wherever they show.
 */
export type PressureLevel = 'low' | 'elevated' | 'high';
export type DashboardView = 'overview' | 'briefs' | 'competitors' | 'map' | 'ads' | 'reviews';
/** Where a click on the dashboard leads: another menu page, or the evidence sheet of one sample capture. */
export type DashboardOpen = { view: DashboardView } | { evidence: string };

export const CLIENT_VIEW = {
  tabs: { dashboard: 'Dashboard', brief: 'Monday brief', friday: 'Friday' },
  /** What to notice on each tab: three numbered notes under the window. */
  notes: {
    dashboard: [
      { title: 'The week in four numbers', body: 'Changes, price moves, rival ads and the rating against the area. Click one to go behind it.' },
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
  nav: [
    { id: 'overview', label: 'Overview' },
    { id: 'briefs', label: 'Monday briefs' },
    { id: 'competitors', label: 'Competitors' },
    { id: 'map', label: 'Map rankings' },
    { id: 'ads', label: 'Ads' },
    { id: 'reviews', label: 'Reviews' },
  ] satisfies { id: DashboardView; label: string }[],
  /** Shown under the window on the menu's other pages, where the numbered notes have no markers to point at. */
  viewNotes: {
    briefs: 'The same brief as the email. Click any underlined claim to see the evidence behind it.',
    competitors: 'Every rival with its tier and latest move. Click one to see the evidence.',
    map: 'Twelve weekly scans of the same search. Press play to watch the rankings change.',
    ads: "This week's new ads and twelve weeks of activity. Click an ad to see it as it ran.",
    reviews: 'Your rating against the area, and new reviews of the rivals you watch.',
  },
  seeAll: 'See all',
  seeAds: 'See all ads',
  quietRival: 'Nothing new this week',
  kpis: [
    { label: 'Changes this week', value: 4, decimals: 0, caption: 'across 3 rivals', open: { view: 'briefs' } },
    { label: 'Competitor price moves', value: 1, decimals: 0, caption: 'Kestrel Mechanical', open: { evidence: 'e3' } },
    { label: 'Active competitor ads', value: 5, decimals: 0, caption: '12-week high', open: { view: 'ads' } },
    { label: 'Your rating vs area', value: 4.8, decimals: 1, caption: 'area average 4.5', open: { view: 'reviews' } },
  ] satisfies { label: string; value: number; decimals: number; caption: string; open: DashboardOpen }[],
  pressure: [
    { name: 'Quillstone Climate Pros', score: 78, level: 'high', reason: 'Top 3 at 31 of 49 map points, up from 8', open: { evidence: 'e1' } },
    { name: 'Juniperwell Air Works', score: 52, level: 'elevated', reason: '2 active ads for the last 4 weeks', open: { view: 'ads' } },
    { name: 'Kestrel Mechanical', score: 44, level: 'elevated', reason: 'Cut its AC repair diagnostic to $69', open: { evidence: 'e3' } },
    { name: 'Tidewell Mechanical', score: 31, level: 'low', reason: 'Added heat pump installation', open: { evidence: 'e6' } },
  ] satisfies { name: string; score: number; level: PressureLevel; reason: string; open: DashboardOpen }[],
  /** Active ads per week over the sample's 12 scan weeks (Quillstone's 2 Meta ads were first seen Oct 7). */
  ads: [
    { name: 'Quillstone Climate Pros', role: 'rival1', points: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2] },
    { name: 'Juniperwell Air Works', role: 'rival2', points: [1, 1, 1, 2, 2, 2, 1, 1, 2, 2, 2, 2] },
    { name: 'Other rivals', role: 'context', points: [1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1] },
  ] satisfies { name: string; role: 'rival1' | 'rival2' | 'context'; points: number[] }[],
  alerts: [
    { title: 'Quillstone Climate Pros moved into the map top 3 at 31 of 49 points', date: '2026-10-13', evidence: 'e1' },
    { title: 'Kestrel Mechanical cut its AC repair diagnostic to $69', date: '2026-10-09', evidence: 'e3' },
    { title: 'Quillstone Climate Pros started 2 Meta ads', date: '2026-10-07', evidence: 'e4' },
  ],
  /** The Reviews page: rating as in the KPI; the reviews are invented like the rest of this tour, with labels for reviewers. */
  reviews: {
    rating: 4.8,
    area: 4.5,
    rival: 'Quillstone Climate Pros',
    from: '2026-10-06',
    to: '2026-10-13',
    reviews: [
      { author: 'Reviewer A', rating: 5, date: '2026-10-12', text: 'Came out the same day and had the AC running within the hour.' },
      { author: 'Reviewer B', rating: 2, date: '2026-10-10', text: 'The repair was fine, but the price went up after they arrived.' },
      { author: 'Reviewer C', rating: 4, date: '2026-10-08', text: 'Good financing offer on our new system. Scheduling took a few calls.' },
    ],
  },
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
