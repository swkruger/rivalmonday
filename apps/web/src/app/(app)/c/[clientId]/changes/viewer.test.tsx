// @vitest-environment jsdom
import type { CompareView, EventDetail } from '@cs/tools';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChangesParams } from './params';

vi.mock('./actions', () => ({ submitFeedbackAction: vi.fn() }));
vi.mock('@/components/help/help-tip', () => ({ HelpTip: () => null }));
vi.mock('@/components/evidence-image', () => ({ EvidenceImage: () => null }));
const { EventViewer } = await import('./viewer');

const detail = {
  eventId: 'e1', summary: 'S', score: 50, route: 'alert', moves: [], myFeedback: null,
  factors: { typeWeight: 1, size: 1, relevance: 1, serviceOverlap: 1, territoryOverlap: 1, novelty: 1, thresholds: { alert: 70, brief: 40 } },
  changes: [{ changeId: 'c1', channelLabel: 'Website', pageUrl: 'https://x.example', detectedAt: '2026-10-22T00:00:00Z' }],
} as unknown as EventDetail;
const side = { captureId: 'cap', capturedAt: '2026-10-22T00:00:00Z', screenshot: null, status: 'ok', hash: 'h', textEvidenceId: null };
const mk = (channel: string, after: unknown): CompareView =>
  ({ channel, channelLabel: channel, before: side, after, pageUrl: null, diff: [], facts: [], details: [] }) as unknown as CompareView;
const P = (tab: ChangesParams['tab']): ChangesParams => ({ route: 'flagged', days: 30, offset: 0, tab });
const view = (compare: CompareView, tab: ChangesParams['tab']) =>
  render(<EventViewer clientId="c" params={P(tab)} detail={detail} compare={compare} canGiveFeedback={false} timezone="UTC" />);

describe('EventViewer capture details', () => {
  const zoned = (tz: string, after: unknown, d = detail) =>
    render(<EventViewer clientId="c" params={P('details')} detail={d} compare={mk('web', after)} canGiveFeedback={false} timezone={tz} />);

  it('captured time shows the client zone label, not toUTCString', () => {
    zoned('America/New_York', { ...side, capturedAt: '2026-10-22T18:30:00Z' });
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('GMT');
    expect(text).toContain('2:30 PM ET');
  });

  it('capture status "robots_disallowed" reads "Site asks not to be monitored"', () => {
    zoned('UTC', { ...side, status: 'robots_disallowed' });
    expect(screen.getByText('Site asks not to be monitored')).toBeTruthy();
    expect(screen.queryByText('robots_disallowed')).toBeNull();
  });

  it('part-of-moves links read the move status label', () => {
    zoned('UTC', side, { ...detail, moves: [{ id: 'm1', label: 'Price war', status: 'emerging' }] } as unknown as EventDetail);
    expect(screen.getByRole('link', { name: 'Price war · Emerging' })).toBeTruthy();
  });
});

describe('EventViewer tabs', () => {
  it('tabs are links with aria-current', () => {
    view(mk('web', side), 'text');
    const links = screen.getAllByRole('link', { name: /Side by side|Text changes|Capture details|Whole page/ });
    expect(links.map((l) => l.textContent)).toEqual(['Side by side', 'Text changes', 'Capture details', 'Whole page']);
    expect(screen.getByRole('link', { name: 'Text changes' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Side by side' }).getAttribute('aria-current')).toBeNull();
  });

  it('Whole page hidden for a vendor change and ?tab=page falls back to Side by side', () => {
    view(mk('google_ads', side), 'page');
    expect(screen.queryByRole('link', { name: 'Whole page' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Side by side' }).getAttribute('aria-current')).toBe('page');
  });
});

describe('EventViewer containers', () => {
  it('Evidence views is a navigation of links, current one marked', () => {
    view(mk('web', side), 'details');
    const nav = screen.getByRole('navigation', { name: 'Evidence views' });
    expect(nav.querySelectorAll('a').length).toBe(4);
    expect(screen.getByRole('link', { name: 'Capture details' }).getAttribute('aria-current')).toBe('page');
  });

  it('score breakdown sits in a band and the viewer has no card', () => {
    const { container } = view(mk('web', side), 'text');
    const band = container.querySelector('[data-slot=band]')!;
    expect(band.textContent).toContain('Why this scored 50');
    expect(container.querySelector('[data-slot=card]')).toBeNull();
  });
});
