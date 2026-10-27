// @vitest-environment jsdom
import type { AlertDetail, BriefDetail, ReportDetail } from '@cs/tools';
import { render, screen, within } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AlertView } from './alert-view';
import { BriefView } from './brief-view';
import { ReportView } from './report-view';

// Pin "now" (Date only) so the year-less date format is stable.
beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-21T12:00:00Z')); });
afterAll(() => { vi.useRealTimers(); });

const C = '00000000-0000-4000-8000-0000000000a1';
const item = (n: number, extra: Partial<BriefDetail['items'][number]> = {}): BriefDetail['items'][number] => ({
  id: `00000000-0000-4000-8000-00000000000${n}`, ord: n, competitorId: C, subject: 'competitor', competitorName: 'Smith HVAC', headline: `Headline ${n}`, whatChanged: 'W', whyItMatters: 'Y',
  recommendedAction: 'Do R', confidence: 0.9, effort: 'L', impact: 'H', evidenceIds: ['e1', 'e2'], status: 'active', upsellTag: null, ...extra,
});
const brief: BriefDetail = {
  id: '00000000-0000-4000-8000-0000000000b1', clientId: C, deliveryDate: '2026-10-12', status: 'sent', kind: 'standard', summary: 'Two moves this week.', sentAt: '2026-10-12T12:00:00Z', generatedAt: '2026-10-11T12:00:00Z',
  hasPdf: true, periodStart: '2026-10-02T00:00:00Z', periodEnd: '2026-10-09T00:00:00Z', approvedAt: '2026-10-10T00:00:00Z',
  items: [item(2), item(1, { upsellTag: 'ppc_audit' }), item(3, { status: 'dropped' })], scorecard: null, trend: null,
};
const scorecard: NonNullable<BriefDetail['scorecard']> = {
  asOf: '2026-10-12T00:00:00Z', baselineBriefId: null,
  tiles: [
    { metric: 'rating', you: 4.6, rivalMedian: 4.4, deltaSinceStart: 0.1 },
    { metric: 'reviews90d', you: 12, rivalMedian: 30, deltaSinceStart: -2 },
    { metric: 'replyRate', you: null, rivalMedian: 0.5, deltaSinceStart: null },
    { metric: 'mapTop3Share', you: 0.31, rivalMedian: 0.2, deltaSinceStart: null },
  ],
  rows: [
    { competitorId: C, name: 'A1 HVAC', self: true, tier: null, values: { rating: 4.6, reviews90d: 12, replyRate: null, mapTop3Share: 0.31, adsActive: null, metaAdsActive: null } },
    { competitorId: '00000000-0000-4000-8000-0000000000a2', name: 'Smith HVAC', self: false, tier: 'top', values: { rating: 4.4, reviews90d: 30, replyRate: 0.5, mapTop3Share: 0.2, adsActive: 2, metaAdsActive: 0 } },
  ],
  evidenceIds: [], openFirstMoves: [{ recommendationId: '00000000-0000-4000-8000-0000000000c1', title: 'Reply to your reviews' }],
};

const alertFixture: AlertDetail = {
  id: '00000000-0000-4000-8000-0000000000d1', clientId: C, competitorName: 'Smith HVAC', headline: 'Cut its AC tune-up price to $69.',
  score: 82, status: 'delivered', createdAt: '2026-10-04T09:00:00Z', deliveredAt: '2026-10-04T09:05:00Z', body: 'The pricing page now shows $69, down from $89.',
  evidenceIds: ['e1', 'e2', 'e3'], written: 'template',
};
const opensInNewTab = (a: HTMLElement) => {
  expect(a.getAttribute('target')).toBe('_blank');
  expect(a.getAttribute('rel')).toContain('noopener');
};

describe('BriefView starting point and quiet week', () => {
  const sp: BriefDetail = {
    ...brief, kind: 'starting_point', summary: 'Where A1 HVAC stands against the 1 rival we now watch. Weekly briefs from here show what changes.', scorecard,
    items: [item(1, { competitorId: null, subject: 'self', competitorName: 'A1 HVAC', headline: 'Reply to reviews' })],
  };
  it('renders starting point sections: title, chip, intro, tiles, scorecard, then the finding', () => {
    render(<BriefView brief={sp} agency={false} timezone="UTC" />);
    expect(screen.getByText('Your starting point')).toBeTruthy();
    expect(screen.getByText('Starting point · Oct 12')).toBeTruthy();
    expect(screen.getByText(/stands against the 1 rival we now watch/)).toBeTruthy();
    for (const l of ['Rating', 'New reviews · 90 d', 'Reply rate', 'Top-3 in map pack']) expect(screen.getAllByText(l).length).toBeGreaterThan(0);
    expect(screen.getAllByText('31%')).toHaveLength(2);
    expect(screen.getByText('rivals 4.4 median')).toBeTruthy();
    expect(screen.getAllByText(/since your starting point/).length).toBeGreaterThan(0);
    const table = screen.getByRole('table', { name: /scorecard/i });
    expect(within(table).getByText('A1 HVAC (you)')).toBeTruthy();
    expect(within(table).getByText('Top rival')).toBeTruthy();
    expect(screen.queryByText('Where you stand')).toBeNull();
  });
  it('self item renders without competitor', () => {
    render(<BriefView brief={sp} agency={false} timezone="UTC" />);
    const article = screen.getByRole('heading', { name: 'Reply to reviews' }).closest('article')!;
    expect(article.textContent).not.toContain('A1 HVAC');
  });
  it('quiet week shows Where you stand, open first moves and the trend table', () => {
    render(<BriefView brief={{ ...sp, kind: 'quiet', summary: 'Quiet.', items: [], trend: { windowDays: 30, events: 0, businesses: [{ competitorId: C, name: 'A1 HVAC', self: true, reviews: 3, avgRating: 4.6, prevAvgRating: 4.5, activeAds: null }] } }} agency={false} timezone="UTC" />);
    expect(screen.getByText('Where you stand')).toBeTruthy();
    expect(screen.getByText('First moves still open')).toBeTruthy();
    expect(screen.getByText('Reply to your reviews')).toBeTruthy();
    expect(screen.getByText('4.5 → 4.6')).toBeTruthy();
  });
  it('quiet trend ratings use the shared rating format (a second decimal when needed)', () => {
    render(<BriefView brief={{ ...sp, kind: 'quiet', summary: 'Quiet.', items: [], trend: { windowDays: 30, events: 0, businesses: [{ competitorId: C, name: 'A1 HVAC', self: true, reviews: 3, avgRating: 4.65, prevAvgRating: null, activeAds: null }] } }} agency={false} timezone="UTC" />);
    expect(screen.getByText('— → 4.65')).toBeTruthy();
  });
  it('the baseline item renders without an empty why-it-matters or "Recommended:" line', () => {
    const baseline = item(1, { competitorId: null, subject: 'self', competitorName: 'A1 HVAC', headline: 'Your baseline is set', whatChanged: 'We now track your profile.', whyItMatters: '', recommendedAction: '' });
    render(<BriefView brief={{ ...sp, items: [baseline] }} agency={false} timezone="UTC" />);
    const article = screen.getByRole('heading', { name: 'Your baseline is set' }).closest('article')!;
    expect(article.textContent).not.toContain('Recommended:');
    expect(article.querySelectorAll('p')).toHaveLength(1);
    render(<BriefView brief={sp} agency={false} timezone="UTC" />);
    expect(screen.getByRole('heading', { name: 'Reply to reviews' }).closest('article')!.textContent).toContain('Recommended: Do R');
  });
});

describe('BriefView', () => {
  it('words the confidence, not only the amber border', () => {
    render(<BriefView brief={{ ...brief, items: [item(1, { confidence: 0.9 }), item(2, { confidence: 0.6 })] }} agency={false} timezone="UTC" />);
    expect(screen.getByText('High confidence 90%')).toBeTruthy();
    expect(screen.getByText('Confidence 60%')).toBeTruthy();
  });

  it('opens the PDF in a new browser tab', () => {
    render(<BriefView brief={brief} agency={false} timezone="UTC" />);
    const a = screen.getByRole('link', { name: 'Download PDF' });
    expect(a.getAttribute('href')).toBe(`/files/brief/${brief.id}`);
    opensInNewTab(a);
  });

  it('renders active items in ord order with anchors and evidence counts', () => {
    const { container } = render(<BriefView brief={brief} agency={false} timezone="UTC" />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Headline 1', 'Headline 2']);
    expect(container.querySelector('#item-00000000-0000-4000-8000-000000000001')).not.toBeNull();
    expect(screen.getAllByRole('link', { name: 'Evidence 1' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Evidence 1' })[0]!.getAttribute('href')).toBe(`/c/${C}/evidence/e1`);
    expect(screen.queryByText(/ppc_audit/)).toBeNull();
    expect(screen.getByRole('link', { name: /download pdf/i }).getAttribute('href')).toBe(`/files/brief/${brief.id}`);
  });

  it('shows agency-only upsell tags and dropped items to agency roles', () => {
    render(<BriefView brief={brief} agency timezone="UTC" />);
    expect(screen.getByText(/ppc_audit/)).toBeTruthy();
    expect(screen.getByText('Headline 3')).toBeTruthy();
  });

  it('the Overview card links to the brief archive; the brief page drops the card title (15a §2.8)', () => {
    const { unmount } = render(<BriefView brief={brief} agency={false} timezone="UTC" archiveHref={`/c/${C}/briefs`} />);
    expect(screen.getByRole('link', { name: 'Brief archive →' }).getAttribute('href')).toBe(`/c/${C}/briefs`);
    expect(screen.getByText('Week of Oct 12')).toBeTruthy();
    unmount();
    render(<BriefView brief={brief} agency={false} timezone="UTC" titled={false} />);
    expect(screen.queryByRole('link', { name: 'Brief archive →' })).toBeNull();
    expect(screen.queryByText('Week of Oct 12')).toBeNull();
    expect(screen.getByRole('link', { name: 'Download PDF' })).toBeTruthy();
  });

  it('renders a quiet brief without items', () => {
    render(<BriefView brief={{ ...brief, kind: 'quiet', items: [], summary: 'No significant competitor moves this week.' }} agency={false} timezone="UTC" />);
    expect(screen.getByText('No significant competitor moves this week.')).toBeTruthy();
  });
});

describe('BriefView surfaces (16b)', () => {
  it('overview surface: a Section with the week as h2, actions in the head and the summary in a Band', () => {
    const { container } = render(<BriefView brief={brief} agency={false} timezone="UTC" archiveHref={`/c/${C}/briefs`} surface="overview" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.matches('section[data-slot="section"]')).toBe(true);
    expect(screen.getByRole('heading', { level: 2, name: 'Week of Oct 12' })).toBeTruthy();
    const head = root.querySelector('[data-slot="section-head"]') as HTMLElement;
    expect(within(head).getByRole('link', { name: 'Download PDF' })).toBeTruthy();
    expect(within(head).getByRole('link', { name: 'Brief archive →' })).toBeTruthy();
    expect(screen.getByText('Two moves this week.').closest('[data-slot="band"]')?.getAttribute('data-tone')).toBe('canvas');
    expect(container.querySelector('[data-slot="card"]')).toBeNull();
    expect(screen.getByText('Headline 1')).toBeTruthy();
  });
  it('overview surface keeps the starting-point title and chip', () => {
    render(<BriefView brief={{ ...brief, kind: 'starting_point' }} agency={false} timezone="UTC" surface="overview" />);
    expect(screen.getByRole('heading', { level: 2, name: 'Your starting point' })).toBeTruthy();
    expect(screen.getByText(/Starting point · /)).toBeTruthy();
  });
  it('card surface (default) keeps the Card', () => {
    const { container } = render(<BriefView brief={brief} agency={false} timezone="UTC" />);
    expect(container.querySelector('[data-slot="card"]')).toBeTruthy();
    expect(container.querySelector('[data-slot="band"]')).toBeNull();
  });
});

describe('BriefView status and dates (15c-2b-2)', () => {
  it('week of a date-only deliveryDate is the same in Pacific/Kiritimati', () => {
    const { unmount } = render(<BriefView brief={brief} agency={false} timezone="Pacific/Kiritimati" />);
    expect(screen.getByText('Week of Oct 12')).toBeTruthy();
    unmount();
    render(<BriefView brief={{ ...brief, deliveryDate: '2026-10-14' }} agency={false} timezone="America/Los_Angeles" />);
    expect(screen.getByText('Week of Oct 12')).toBeTruthy();
  });
  it('agency sees the labelled status and dropped chips', () => {
    render(<BriefView brief={brief} agency timezone="UTC" />);
    expect(screen.getByText('Sent')).toBeTruthy();
    expect(screen.getByText('Dropped')).toBeTruthy();
  });
  it('client role sees no status chip, score or dropped item', () => {
    const { container } = render(<BriefView brief={brief} agency={false} timezone="UTC" />);
    expect(container.querySelector('[data-slot="status-chip"]')).toBeNull();
    expect(screen.queryByText('Dropped')).toBeNull();
    expect(screen.queryByText('Headline 3')).toBeNull();
    expect(screen.queryByText(/ppc_audit|Upsell/)).toBeNull();
    const { container: a } = render(<AlertView alert={alertFixture} agency={false} timezone="UTC" />);
    expect(a.querySelector('[data-slot="status-chip"]')).toBeNull();
    expect(screen.queryByText(/Score \d/)).toBeNull();
  });
});

describe('AlertView', () => {
  it('alert view time is "Oct 12, 9:00 AM CT" for a Chicago client', () => {
    render(<AlertView alert={{ ...alertFixture, deliveredAt: '2026-10-12T14:00:00Z' }} agency={false} timezone="America/Chicago" />);
    expect(screen.getByText('Oct 12, 9:00 AM CT')).toBeTruthy();
  });

  it('agency sees a neutral score chip and the labelled status', () => {
    render(<AlertView alert={alertFixture} agency timezone="UTC" />);
    expect(screen.getByText('Score 82')).toBeTruthy();
    expect(screen.getByText('Sent')).toBeTruthy();
  });

  it('shows the template-fallback note to agency roles only', () => {
    render(<AlertView alert={alertFixture} agency timezone="UTC" />);
    expect(screen.getByText(/template text/i)).toBeTruthy();
  });

  it('never shows the template-fallback note to client roles, even when written is template', () => {
    render(<AlertView alert={alertFixture} agency={false} timezone="UTC" />);
    expect(screen.queryByText(/template text/i)).toBeNull();
  });

  it('renders the competitor name, headline, body and evidence count for every role', () => {
    render(<AlertView alert={alertFixture} agency={false} timezone="UTC" />);
    expect(screen.getByRole('heading', { level: 2, name: alertFixture.headline })).toBeTruthy();
    expect(screen.getByText('Smith HVAC')).toBeTruthy();
    expect(screen.getByText(alertFixture.body)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /^Evidence \d/ })).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Evidence 1' }).getAttribute('href')).toBe(`/c/${C}/evidence/e1`);
  });
});

describe('ReportView', () => {
  it('renders deterministic report numbers with readable change-type labels', () => {
    const report: ReportDetail = {
      id: '00000000-0000-4000-8000-0000000000c1', clientId: C, quarter: '2026-Q3', status: 'sent', sentAt: null, hasPdf: false, periodStart: '2026-07-01T00:00:00Z', periodEnd: '2026-09-30T00:00:00Z',
      data: { quarter: '2026-Q3', windowDays: 90, businesses: [{ competitorId: C, name: 'You', self: true, reviews: 40, avgRating: 4.7, prevAvgRating: 4.6, activeAds: null }], eventsByType: { price_change: 3 }, moves: [], briefsSent: 12, alertsDelivered: 2, recommendations: { created: 5, done: 2, inProgress: 1, dismissed: 1 } },
    };
    render(<ReportView report={report} />);
    const table = screen.getByRole('table', { name: /businesses/i });
    expect(within(table).getByText('You')).toBeTruthy();
    expect(screen.getByText(/price change/i)).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
  });

  const withMoves: ReportDetail = {
    id: '00000000-0000-4000-8000-0000000000c3', clientId: C, quarter: '2026-Q3', status: 'sent', sentAt: null, hasPdf: false, periodStart: '2026-07-01T00:00:00Z', periodEnd: '2026-09-30T00:00:00Z',
    data: { quarter: '2026-Q3', windowDays: 90, businesses: [], eventsByType: {}, moves: [{ moveType: 'price_war', competitorName: 'Smith HVAC', status: 'active', firstDetectedAt: '2026-08-14T09:00:00Z' }], briefsSent: 1, alertsDelivered: 0, recommendations: { created: 0, done: 0, inProgress: 0, dismissed: 0 } },
  } as unknown as ReportDetail;

  it('report period reads "Jul 1 to Sep 30"', () => {
    render(<ReportView report={withMoves} />);
    expect(screen.getByText('Jul 1 to Sep 30')).toBeTruthy();
  });

  it('report moves read "Price war · … · Active", never price_war', () => {
    render(<ReportView report={withMoves} />);
    expect(screen.getByText('Price war · Smith HVAC · Active · first detected Aug 14')).toBeTruthy();
    expect(screen.queryByText(/price_war/)).toBeNull();
  });

  it('empty report shows the empty state', () => {
    render(<ReportView report={{ ...withMoves, data: null }} />);
    expect(screen.getByText('No figures in this report')).toBeTruthy();
  });

  it('renders a placeholder when the report has no data', () => {
    const report: ReportDetail = {
      id: '00000000-0000-4000-8000-0000000000c2', clientId: C, quarter: '2026-Q4', status: 'sent', sentAt: null, hasPdf: false, periodStart: '2026-10-01T00:00:00Z', periodEnd: '2026-12-31T00:00:00Z',
      data: null,
    };
    render(<ReportView report={report} />);
    expect(screen.getByText('No figures in this report')).toBeTruthy();
    expect(screen.queryByText('This report has no data.')).toBeNull();
    opensInNewTab(screen.getByRole('link', { name: 'Download PDF' }));
  });
});
