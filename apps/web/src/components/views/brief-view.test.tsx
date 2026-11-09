// @vitest-environment jsdom
import type { BriefDetail } from '@cs/tools';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BriefView } from './brief-view';
import type { ChangeLine } from '@cs/core';

const C = '00000000-0000-4000-8000-0000000000a1';
const brief: BriefDetail = {
  id: '00000000-0000-4000-8000-0000000000b1', clientId: C, deliveryDate: '2026-10-12', status: 'sent', kind: 'starting_point', summary: 'Where you stand.', sentAt: '2026-10-12T12:00:00Z',
  generatedAt: '2026-10-11T12:00:00Z', hasPdf: true, periodStart: '2026-10-02T00:00:00Z', periodEnd: '2026-10-09T00:00:00Z', approvedAt: '2026-10-10T00:00:00Z',
  items: [{
    id: '00000000-0000-4000-8000-000000000001', ord: 1, competitorId: C, subject: 'competitor', competitorName: 'Smith HVAC', headline: 'H', whatChanged: 'W', whyItMatters: 'Y',
    recommendedAction: 'R', confidence: 0.9, effort: 'L', impact: 'H', evidenceIds: ['e1', 'e2'], status: 'active', upsellTag: null,
  }],
  scorecard: null, trend: null, changes: null,
};
afterEach(cleanup);

describe('BriefView evidenceHref (17a)', () => {
  it('default: app evidence links and the PDF link', () => {
    render(<BriefView brief={brief} agency={false} timezone="UTC" />);
    expect(screen.getByRole('link', { name: 'Evidence 1' }).getAttribute('href')).toBe(`/c/${C}/evidence/e1`);
    expect(screen.getByRole('link', { name: 'Download PDF' })).toBeTruthy();
  });

  it('evidenceHref routes every chip and drops the PDF link (no app links)', () => {
    const refs = { e1: { source: 'Smith HVAC', channel: 'Website', date: 'Oct 8', servable: true }, e2: { source: 'Smith HVAC', channel: 'Google Business Profile', date: 'Oct 8', servable: false } };
    render(<BriefView brief={brief} agency={false} timezone="UTC" titled={false} refs={refs} evidenceHref={(id) => `/sample/T/evidence/${id}`} />);
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/sample/T/evidence/e1']);
    expect(screen.queryByText('Download PDF')).toBeNull();
  });
});

describe('BriefView graded changes and scorecard gating', () => {
  const scorecard = { asOf: '2026-10-09T00:00:00Z', baselineBriefId: null, tiles: [], rows: [], evidenceIds: [], openFirstMoves: [] } as unknown as BriefDetail['scorecard'];
  const ln: ChangeLine = {
    grade: 'notable', topic: 'offers', competitorId: C, competitorName: 'Smith HVAC', changeType: 'price_change', channel: 'web', count: 1, text: 'Smith HVAC cut a price.',
    firstAt: '2026-10-06T10:00:00.000Z', lastAt: '2026-10-06T10:00:00.000Z', eventIds: [C], evidenceIds: [],
  };
  const weekly = (over: Partial<BriefDetail>): BriefDetail => ({ ...brief, kind: 'standard', ...over });
  const changes = { lines: [ln], totals: { major: 0, notable: 1, minor: 0 } };

  it('renders the graded list on the reading surface only', () => {
    const a = render(<BriefView brief={weekly({ changes })} agency={false} timezone="UTC" changesLinkAllowed />);
    expect(screen.getByRole('heading', { name: 'Other changes this week' })).toBeTruthy();
    expect(screen.getByText('Smith HVAC cut a price.')).toBeTruthy();
    a.unmount();
    render(<BriefView brief={weekly({ changes })} agency={false} timezone="UTC" surface="overview" changesLinkAllowed={false} />);
    expect(screen.queryByRole('heading', { name: 'Other changes this week' })).toBeNull();
  });

  it('the link carries the brief period as from/to days in the viewer zone', () => {
    const lines = Array.from({ length: 11 }, (_, i) => ({ ...ln, text: `L${i}` }));
    render(<BriefView brief={weekly({ changes: { lines, totals: { major: 0, notable: 11, minor: 0 } } })} agency={false} timezone="America/Chicago" changesLinkAllowed />);
    expect(screen.getByRole('link', { name: 'See all changes this week' }).getAttribute('href')).toBe(`/c/${C}/changes?route=all&from=2026-10-01&to=2026-10-08`);
  });

  it('no link when the viewer cannot open the Changes page', () => {
    const lines = Array.from({ length: 11 }, (_, i) => ({ ...ln, text: `L${i}` }));
    render(<BriefView brief={weekly({ changes: { lines, totals: { major: 0, notable: 11, minor: 0 } } })} agency={false} timezone="UTC" changesLinkAllowed={false} />);
    expect(screen.getByText('+1 more')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'See all changes this week' })).toBeNull();
  });

  it('"Where you stand" only for quiet weeks', () => {
    const a = render(<BriefView brief={weekly({ scorecard })} agency={false} timezone="UTC" changesLinkAllowed />);
    expect(screen.queryByText('Where you stand')).toBeNull();
    a.unmount();
    render(<BriefView brief={weekly({ kind: 'quiet', scorecard })} agency={false} timezone="UTC" changesLinkAllowed />);
    expect(screen.getByText('Where you stand')).toBeTruthy();
  });
});
