import type { BriefReport, ChangeLine, GradedChangesView, ReportTopic } from '@cs/core';
import { describe, expect, it } from 'vitest';
import { resolveBranding } from './branding';
import { ratingDomain } from './templates/brief-report';
import { kpiTiles } from './templates/report/summary';
import { renderBriefDocument, renderBriefReportDocument } from './document';
import type { BriefEmailProps, BriefReportDocumentProps } from './types';

const branding = resolveBranding('Acme Marketing', null);
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
const weeks = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, 7, 17 + i * 7)).toISOString().slice(0, 10));
const series = (key: string, name: string, v: number | null, you = false) => ({ key, name, points: Array.from({ length: 12 }, () => v), ...(you ? { you: true } : {}) });

const line = (n: number, topic: ReportTopic, grade: ChangeLine['grade'], text = `Line ${topic} ${n} text`): ChangeLine => ({
  grade, topic, competitorId: uuid(1), competitorName: 'Smith HVAC', changeType: topic === 'reviews' ? 'rating_change' : topic === 'ads' ? 'ad_started' : topic === 'rankings' ? 'rank_change' : 'price_change',
  channel: null, count: 1, text, firstAt: '2026-10-01T15:00:00.000Z', lastAt: '2026-10-02T15:00:00.000Z', eventIds: [uuid(1000 + n)], evidenceIds: [],
});

const kpis = { changes7d: 9, alerts7d: 2, priceMoves7d: 3, priceCuts7d: 1, activeAds: 7, activeAds7dAgo: 5, ratingSelf: 4.6, ratingAvg: 4.2, weekly: { changes: [1, 2, 3, 4, 5, 6, 7, 9], priceMoves: [0, 0, 1, 0, 2, 1, 0, 3], activeAds: [5, 5, 6, 6, 5, 5, 5, 7] } };

const fullReport = (lines: ChangeLine[]): BriefReport => ({
  v: 1, asOf: '2026-10-04T12:00:00.000Z',
  changes: { v: 1, threshold: 47.25, lines, totals: { major: 2, notable: 1, minor: 1 } },
  kpis,
  pressure: [{ competitorId: uuid(1), name: 'Smith HVAC', score: 63.4, level: 'elevated', reason: 'Cut prices twice this month' }],
  rating: { months, series: [series('self', 'A1 HVAC', 4.6, true), series(uuid(1), 'Smith HVAC', 4.1)] },
  ads: { weeks, series: [series(uuid(1), 'Smith HVAC', 3)] },
  rankings: {
    scanAt: '2026-10-04T06:00:00.000Z', prevScanAt: '2026-09-27T06:00:00.000Z',
    keywords: [{ keyword: 'ac repair', you: { avgRank: 3.2, top3Share: 0.4, points: 25 }, prev: { avgRank: 4.1, top3Share: 0.3, points: 25 }, rivals: [{ name: 'Smith HVAC', metric: { avgRank: 2.1, top3Share: 0.6, points: 25 } }] }],
    map: null,
  },
  moves: [{ id: uuid(50), competitorName: 'Smith HVAC', moveType: 'price_war', label: 'Price war', status: 'active', firstDetectedAt: '2026-09-20T00:00:00.000Z' }],
  recommendations: [{ id: uuid(60), title: 'Answer the price cut on your service page', status: 'todo', createdThisWeek: true }],
  alerts: [{ headline: 'Smith HVAC cut its tune-up price to $69', competitorName: 'Smith HVAC', deliveredAt: '2026-10-02T14:00:00.000Z' }],
});

const majorItem = { competitorName: 'Smith HVAC', headline: 'Smith HVAC cut its tune-up price', whatChanged: 'The tune-up is now $69.', whyItMatters: 'Price shoppers compare.', recommendedAction: 'Show your own tune-up price.', effort: 'L' as const, impact: 'H' as const, link: 'https://app.example/l/i1', topic: 'offers' as const };

const legacy: BriefEmailProps = {
  branding, recipientName: null, clientName: 'A1 HVAC', deliveryDate: '2026-10-05', kind: 'standard', summary: 'Two competitors moved on price.',
  items: [{ ...majorItem, headline: 'Headline 1' }], link: null, pdfLink: null, signOff: '— Sam, Acme Marketing', feedback: null,
  trend: { windowDays: 30, events: 4, businesses: [{ competitorId: 'c2', name: 'Smith HVAC', self: false, reviews: 30, avgRating: 4.1, prevAvgRating: 4.4, activeAds: 7 }] },
};

const props = (over: Partial<BriefReportDocumentProps> = {}): BriefReportDocumentProps => {
  const lines = [line(1, 'reviews', 'notable'), line(2, 'offers', 'minor')];
  const changes: GradedChangesView = { lines, totals: { major: 2, notable: 1, minor: 1 } };
  return {
    branding, clientName: 'A1 HVAC', deliveryDate: '2026-10-05', periodLabel: 'Sep 28 – Oct 4', kind: 'standard', summary: 'Two competitors moved on price.',
    items: [majorItem], changes, report: fullReport(lines), scorecard: null, trend: legacy.trend, timezone: 'America/Chicago', mapImage: null, legacy, ...over,
  };
};

const sections = (html: string) => [...html.matchAll(/data-section="([a-z_]+)"/g)].map((m) => m[1]);

describe('weekly report document', () => {
  it('cover names the agency and never Rival Monday', async () => {
    const html = await renderBriefReportDocument(props());
    expect(html).toContain('Acme Marketing');
    expect(html).toContain('Weekly competitor report');
    expect(html).toContain('A1 HVAC');
    expect(html).toMatch(/Week of October 5, 2026/);
    expect(html).not.toMatch(/rival\s*monday/i);
    expect(html).toContain('@page');
  });

  it('renders the sections in spec order with Major items, top move and next steps, and no links', async () => {
    const html = await renderBriefReportDocument(props());
    expect(sections(html)).toEqual(['cover', 'summary', 'reviews', 'ads', 'rankings', 'offers', 'moves', 'recommendations', 'alerts']);
    expect(html).toContain('Top move');
    expect(html).toContain('Smith HVAC cut its tune-up price');
    expect(html).toContain('Next steps');
    expect(html).toContain('Show your own tune-up price.');
    expect(html).toContain('Competitive pressure');
    expect(html).toContain('2 Major · 1 Notable · 1 Minor changes');
    expect(html).toContain('What changed:');
    expect(html).toContain('Line reviews 1 text');
    // Ads has a chart but no change this week.
    expect(html.slice(html.indexOf('data-section="ads"'), html.indexOf('data-section="rankings"'))).toContain('No changes this week.');
    expect(html).toContain('ac repair');
    expect(html).toContain('Price war');
    expect(html).toContain('New this week');
    expect(html).toContain('Smith HVAC cut its tune-up price to $69');
    expect(html).not.toContain('href=');
    expect(html).not.toMatch(/Something look off|mailto:|Friday|Ask /);
  });

  it('rating chart uses a [floor, 5] half-star axis', async () => {
    const html = await renderBriefReportDocument(props());
    const reviews = html.slice(html.indexOf('data-section="reviews"'), html.indexOf('data-section="ads"'));
    const svg = reviews.slice(reviews.indexOf('<svg'), reviews.indexOf('</svg>'));
    const ticks = [...svg.matchAll(/text-anchor="end"[^>]*>([\d.]+)</g)].map((m) => Number(m[1]));
    expect(Math.max(...ticks)).toBe(5);
    expect(Math.min(...ticks)).toBeGreaterThan(0);
    expect(ratingDomain([{ key: 'a', name: 'A', points: [3.9, 4.8, null] }])).toEqual([3, 5]);
    expect(ratingDomain([{ key: 'a', name: 'A', points: [null] }])).toEqual([0, 5]);
  });

  it('cover band follows the app brand-ink rule; the agency name stays ink', async () => {
    const teal = resolveBranding('Acme Marketing', { secondary: '#0F766E' });
    const html = await renderBriefReportDocument(props({ branding: teal }));
    expect(html).toContain('background-color:#0b554f');
    expect(await renderBriefReportDocument(props())).toContain('background-color:#0B2540');
  });

  it('rankings table drops "Previous scan" without a previous scan', async () => {
    const r = fullReport([]);
    expect(await renderBriefReportDocument(props())).toContain('Previous scan');
    const html = await renderBriefReportDocument(props({ report: { ...r, rankings: { ...r.rankings!, prevScanAt: null } } }));
    expect(html).toContain('ac repair');
    expect(html).not.toContain('Previous scan');
  });

  it('map section has image, overlay and attribution', async () => {
    const r = fullReport([]);
    const map = { keyword: 'ac repair', objectKey: 'rank-map/x.png', bounds: { west: -97.1, south: 32.9, east: -96.9, north: 33.1 }, width: 600, height: 400, points: [{ lat: 33, lng: -97, rank: 3 }, { lat: 33.05, lng: -96.95, rank: null }, { lat: 32.95, lng: -97.05, rank: 25 }] };
    const html = await renderBriefReportDocument(props({ report: { ...r, rankings: { ...r.rankings!, map } }, mapImage: { dataUri: 'data:image/png;base64,AAAA', attribution: '© Stadia Maps © OpenStreetMap contributors' } }));
    const rankings = html.slice(html.indexOf('data-section="rankings"'), html.indexOf('data-section="offers"'));
    expect(rankings).toContain('data:image/png;base64,AAAA');
    expect(rankings).toContain('data-map-overlay');
    expect(rankings.match(/data-rank-dot/g)).toHaveLength(3);
    expect(rankings).toMatch(/>3</);
    expect(rankings).toContain('>–<');
    expect(rankings).toContain('>20+<');
    expect(rankings).toContain('© Stadia Maps © OpenStreetMap contributors');
    // dot of (33, -97): x = (-97 - -97.1) / 0.2 * 600 = 300
    expect(rankings).toMatch(/cx="300(\.0+)?"/);
  });

  it('no map image ⇒ table only', async () => {
    const html = await renderBriefReportDocument(props());
    expect(html).not.toContain('data-map-overlay');
    expect(html).not.toContain('data:image');
    expect(html).toContain('Average map position by keyword');
  });

  it('omits empty sections and prints no NaN', async () => {
    const empty: BriefReport = {
      ...fullReport([]), changes: { v: 1, threshold: 40, lines: [], totals: { major: 0, notable: 0, minor: 0 } },
      kpis: { changes7d: 0, alerts7d: 0, priceMoves7d: 0, priceCuts7d: 0, activeAds: null, activeAds7dAgo: null, ratingSelf: null, ratingAvg: null, weekly: { changes: [0, 0, 0, 0, 0, 0, 0, 0], priceMoves: [0, 0, 0, 0, 0, 0, 0, 0], activeAds: [null, null, null, null, null, null, null, null] } },
      pressure: [], rating: { months, series: [series('self', 'A1 HVAC', null, true)] }, ads: { weeks, series: [] }, rankings: null, moves: [], recommendations: [], alerts: [],
    };
    const html = await renderBriefReportDocument(props({ kind: 'quiet', items: [], report: empty, changes: { lines: [], totals: { major: 0, notable: 0, minor: 0 } }, trend: null }));
    expect(sections(html)).toEqual(['cover', 'summary']);
    expect(html).toContain('No major moves this week');
    expect(html).not.toContain('Competitive pressure');
    expect(html).not.toContain('Next steps');
    expect(html).not.toMatch(/NaN|undefined|Infinity|null/);
  });

  it('caps a 240-event week at 12/12 per topic', async () => {
    const topics: ReportTopic[] = ['reviews', 'ads', 'rankings', 'offers'];
    const lines = topics.flatMap((t, ti) => Array.from({ length: 60 }, (_, i) => line(ti * 100 + i, t, i % 2 === 0 ? 'notable' : 'minor', `L-${t}-${i}-end`)));
    expect(lines).toHaveLength(240);
    const html = await renderBriefReportDocument(props({ items: [], changes: { lines, totals: { major: 0, notable: 120, minor: 120 } }, report: fullReport(lines) }));
    for (const t of topics) expect((html.match(new RegExp(`L-${t}-\\d+-end`, 'g')) ?? []).length, t).toBe(24);
    expect((html.match(/\+18 more in your dashboard/g) ?? []).length).toBe(8);
  });

  it('no upsell_tag, score or threshold in the HTML', async () => {
    const leaky = { ...majorItem, upsellTag: 'lsa', score: 88.8 } as typeof majorItem;
    const html = await renderBriefReportDocument(props({ items: [leaky] }));
    expect(html).not.toMatch(/upsell|\blsa\b|threshold|47\.25|63\.4|88\.8/i);
  });

  it('prints the live lines it is given, never the stored report lines', async () => {
    const stored = [line(1, 'offers', 'notable', 'Retracted line'), line(2, 'offers', 'notable', 'Live line')];
    const html = await renderBriefReportDocument(props({ report: fullReport(stored), changes: { lines: [stored[1]!], totals: { major: 0, notable: 1, minor: 0 } } }));
    expect(html).toContain('Live line');
    expect(html).not.toContain('Retracted line');
  });

  it('"Changes this week" tile = live grade totals sum (agrees with the totals line); falls back to kpis.changes7d without a live view', async () => {
    expect(kpiTiles(kpis, { lines: [], totals: { major: 3, notable: 7, minor: 22 } })[0]).toMatchObject({ title: 'Changes this week', value: '32' });
    expect(kpiTiles(kpis, null)[0]!.value).toBe('9');
    const html = await renderBriefReportDocument(props({ changes: { lines: [line(1, 'offers', 'major')], totals: { major: 3, notable: 7, minor: 22 } } }));
    const summary = html.slice(html.indexOf('data-section="summary"'));
    expect(summary).toMatch(/Changes this week<\/div><div[^>]*>32<\/div>/);
    expect(summary).toContain('3 Major · 7 Notable · 22 Minor changes');
  });

  it('old brief (report null) renders cover + legacy body', async () => {
    const html = await renderBriefReportDocument(props({ report: null, changes: null }));
    expect(html).toContain('Weekly competitor report');
    expect(html).toContain('Headline 1');
    expect(html).toContain('This week');
    expect(html).toContain('4.4 → 4.1');
    expect(sections(html)).toEqual(['cover', 'legacy']);
    expect(html).not.toMatch(/rival\s*monday|href=/i);
  });

  it('starting point renders exactly the old document', async () => {
    const sp: BriefEmailProps = { ...legacy, kind: 'starting_point', summary: 'Where A1 HVAC stands.' };
    expect(await renderBriefReportDocument(props({ kind: 'starting_point', report: null, changes: null, legacy: sp }))).toBe(await renderBriefDocument(sp));
  });
});
