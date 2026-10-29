// @vitest-environment jsdom
import type { BriefDetail } from '@cs/tools';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BriefView } from './brief-view';

const C = '00000000-0000-4000-8000-0000000000a1';
const brief: BriefDetail = {
  id: '00000000-0000-4000-8000-0000000000b1', clientId: C, deliveryDate: '2026-10-12', status: 'sent', kind: 'starting_point', summary: 'Where you stand.', sentAt: '2026-10-12T12:00:00Z',
  generatedAt: '2026-10-11T12:00:00Z', hasPdf: true, periodStart: '2026-10-02T00:00:00Z', periodEnd: '2026-10-09T00:00:00Z', approvedAt: '2026-10-10T00:00:00Z',
  items: [{
    id: '00000000-0000-4000-8000-000000000001', ord: 1, competitorId: C, subject: 'competitor', competitorName: 'Smith HVAC', headline: 'H', whatChanged: 'W', whyItMatters: 'Y',
    recommendedAction: 'R', confidence: 0.9, effort: 'L', impact: 'H', evidenceIds: ['e1', 'e2'], status: 'active', upsellTag: null,
  }],
  scorecard: null, trend: null,
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
