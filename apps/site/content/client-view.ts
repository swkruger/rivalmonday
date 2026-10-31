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
      { title: 'Where you stand', body: 'Your numbers next to every rival, and how far you have come since your starting point.' },
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
  /** Mirrors the app's `overview-kpis.ts`: same titles and pill wording. `trace` = the last eight weeks (the ads one follows `ads` below). */
  kpis: [
    { label: 'Changes this week', value: 4, decimals: 0, suffix: '', pill: { text: '1 high', tone: 'warn' }, caption: 'Across websites, ads, reviews and profiles', trace: [1, 2, 1, 0, 2, 1, 3, 4], traceLabel: 'Changes per week, last 8 weeks', open: { view: 'briefs' } },
    { label: 'Competitor price moves', value: 1, decimals: 0, suffix: '', pill: { text: '↓ 1 cut', tone: 'down' }, caption: 'On services you also offer', trace: [0, 0, 1, 0, 0, 0, 0, 1], traceLabel: 'Price moves per week, last 8 weeks', open: { evidence: 'e3' } },
    { label: 'Active competitor ads', value: 5, decimals: 0, suffix: '', pill: { text: 'Same as last week', tone: 'info' }, caption: 'Meta and Google, where visible', trace: [3, 3, 2, 2, 4, 5, 5, 5], traceLabel: 'Active competitor ads, last 8 weeks', open: { view: 'ads' } },
    { label: 'Your rating vs area', value: 4.8, decimals: 1, suffix: ' ★', pill: { text: '+0.3 above avg', tone: 'up' }, caption: 'Competitor average 4.5', trace: [4.6, 4.6, 4.7, 4.7, 4.7, 4.8, 4.8, 4.8], traceLabel: 'Your average stars per month', open: { view: 'reviews' } },
  ] satisfies { label: string; value: number; decimals: number; suffix: string; pill: { text: string; tone: 'up' | 'down' | 'warn' | 'info' }; caption: string; trace: number[]; traceLabel: string; open: DashboardOpen }[],
  overview: {
    description: 'How Northwind Heating & Air compares with its competitors this week. Tracking 6 competitors across 2 ZIP codes.',
    archive: 'Brief archive →',
    summary: 'Four rival moves this week. Quillstone Climate Pros gained the most ground on the map, and Kestrel Mechanical cut its AC repair diagnostic to $69.',
    ask: { title: 'Ask Friday', open: 'Open →', body: 'Questions about your competitors, answered from the monitored evidence.', placeholder: 'Ask Friday a question…', button: 'Ask' },
    askAction: 'Ask Friday',
  },
  /** "Where you stand": the app's scorecard. Top-3 is the sample map's first and latest scans (1 and 42 of 49 points); rival medians come from `table`. */
  standing: {
    heading: 'Where you stand',
    tiles: [
      { label: 'Rating', value: '4.8', trend: '0.2 since start', up: true, sub: 'rivals 4.5 median' },
      { label: 'New reviews · 90 d', value: '27', trend: '9 since start', up: true, sub: 'rivals 13 median' },
      { label: 'Reply rate', value: '82%', trend: '6 pts since start', up: true, sub: 'rivals 61% median' },
      { label: 'Top-3 in map pack', value: '86%', trend: '84 pts since start', up: true, sub: 'rivals 37% median' },
    ],
    headers: ['Business', 'Rating', 'Reviews 90 d', 'Reply rate', 'Map top-3', 'Google ads', 'Meta ads'],
    self: { name: 'Northwind Heating & Air (you)', cells: ['4.8', '27', '82%', '86%', '1', '0'] },
    /** Active ads add up to the KPI's 5 and match `ads` (Quillstone 2, Juniperwell 2, others 1). Minor rivals get the light watch, so most cells stay empty. */
    table: [
      { rivalId: 'r1', cells: ['4.6', '31', '64%', '63%', '0', '2'] },
      { rivalId: 'r2', cells: ['4.5', '22', '71%', '41%', '1', '1'] },
      { rivalId: 'r3', cells: ['4.4', '14', '58%', '33%', '1', '0'] },
      { rivalId: 'r4', cells: ['4.5', '12', '40%', '18%', '0', '0'] },
      { rivalId: 'r5', cells: ['4.6', '9', '—', '—', '—', '—'] },
      { rivalId: 'r6', cells: ['4.4', '8', '—', '—', '—', '—'] },
    ],
    movesHeading: 'First moves still open',
    moves: ['Text every customer a Google review link right after the job is done.', 'Add heat pump installation to your Google Business Profile services.'],
  },
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
