// @vitest-environment jsdom
import type { AlertDetail, BriefDetail, ReportDetail } from '@cs/tools';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AlertView } from './alert-view';
import { BriefView } from './brief-view';
import { ReportView } from './report-view';

const C = '00000000-0000-4000-8000-0000000000a1';
const item = (n: number, extra: Partial<BriefDetail['items'][number]> = {}): BriefDetail['items'][number] => ({
  id: `00000000-0000-4000-8000-00000000000${n}`, ord: n, competitorId: C, competitorName: 'Smith HVAC', headline: `Headline ${n}`, whatChanged: 'W', whyItMatters: 'Y',
  recommendedAction: 'Do R', confidence: 0.9, effort: 'L', impact: 'H', evidenceIds: ['e1', 'e2'], status: 'active', upsellTag: null, ...extra,
});
const brief: BriefDetail = {
  id: '00000000-0000-4000-8000-0000000000b1', clientId: C, deliveryDate: '2026-10-12', status: 'sent', kind: 'standard', summary: 'Two moves this week.', sentAt: '2026-10-12T12:00:00Z',
  hasPdf: true, periodStart: '2026-10-02T00:00:00Z', periodEnd: '2026-10-09T00:00:00Z', approvedAt: '2026-10-10T00:00:00Z',
  items: [item(2), item(1, { upsellTag: 'ppc_audit' }), item(3, { status: 'dropped' })],
};

describe('BriefView', () => {
  it('renders active items in ord order with anchors and evidence counts', () => {
    const { container } = render(<BriefView brief={brief} agency={false} />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Headline 1', 'Headline 2']);
    expect(container.querySelector('#item-00000000-0000-4000-8000-000000000001')).not.toBeNull();
    expect(screen.getAllByRole('link', { name: 'Evidence 1' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Evidence 1' })[0]!.getAttribute('href')).toBe(`/c/${C}/evidence/e1`);
    expect(screen.queryByText(/ppc_audit/)).toBeNull();
    expect(screen.getByRole('link', { name: /download pdf/i }).getAttribute('href')).toBe(`/files/brief/${brief.id}`);
  });

  it('shows agency-only upsell tags and dropped items to agency roles', () => {
    render(<BriefView brief={brief} agency />);
    expect(screen.getByText(/ppc_audit/)).toBeTruthy();
    expect(screen.getByText('Headline 3')).toBeTruthy();
  });

  it('renders a quiet brief without items', () => {
    render(<BriefView brief={{ ...brief, kind: 'quiet', items: [], summary: 'No significant competitor moves this week.' }} agency={false} />);
    expect(screen.getByText('No significant competitor moves this week.')).toBeTruthy();
  });
});

describe('AlertView', () => {
  const alert: AlertDetail = {
    id: '00000000-0000-4000-8000-0000000000d1', clientId: C, competitorName: 'Smith HVAC', headline: 'Cut its AC tune-up price to $69.',
    score: 82, status: 'delivered', createdAt: '2026-10-04T09:00:00Z', deliveredAt: '2026-10-04T09:05:00Z', body: 'The pricing page now shows $69, down from $89.',
    evidenceIds: ['e1', 'e2', 'e3'], written: 'template',
  };

  it('shows the template-fallback note to agency roles only', () => {
    render(<AlertView alert={alert} agency />);
    expect(screen.getByText(/template text/i)).toBeTruthy();
  });

  it('never shows the template-fallback note to client roles, even when written is template', () => {
    render(<AlertView alert={alert} agency={false} />);
    expect(screen.queryByText(/template text/i)).toBeNull();
  });

  it('renders the competitor name, headline, body and evidence count for every role', () => {
    render(<AlertView alert={alert} agency={false} />);
    expect(screen.getByRole('heading', { level: 2, name: alert.headline })).toBeTruthy();
    expect(screen.getByText('Smith HVAC')).toBeTruthy();
    expect(screen.getByText(alert.body)).toBeTruthy();
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

  it('renders a placeholder when the report has no data', () => {
    const report: ReportDetail = {
      id: '00000000-0000-4000-8000-0000000000c2', clientId: C, quarter: '2026-Q4', status: 'sent', sentAt: null, hasPdf: false, periodStart: '2026-10-01T00:00:00Z', periodEnd: '2026-12-31T00:00:00Z',
      data: null,
    };
    render(<ReportView report={report} />);
    expect(screen.getByText('This report has no data.')).toBeTruthy();
  });
});
