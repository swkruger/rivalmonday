// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ features: ['dashboard'] as string[], events: null as unknown, calls: [] as [string, unknown][] }));

vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: 'client_owner', features: new Set(m.features) } }) }));
vi.mock('@/server/tools', () => {
  const impl = async (_c: unknown, name: string, input: unknown) => {
    m.calls.push([name, input]);
    if (name === 'list_listed_events') return m.events;
    return { name: 'Lone Star Cooling', timezone: 'UTC' };
  };
  return { callTool: impl, tryCallTool: impl };
});
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set() }));
vi.mock('@/server/viewer-tz', () => ({ viewerTimeZone: async () => 'America/Chicago' }));
vi.mock('@/components/help/help-tip', () => ({ HelpTip: () => null }));
vi.mock('@/components/help/help-context', () => ({ HelpText: ({ text }: { text: string }) => <>{text}</> }));
vi.mock('@/components/page-header', () => ({
  PageHeader: ({ title, tone, description }: { title: string; tone?: string; description: React.ReactNode }) => <div data-testid="page-header" data-title={title} data-tone={tone}>{description}</div>,
}));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import EventsPage from './page';

const C = '00000000-0000-4000-8000-0000000000c1';
const ev = (o: Record<string, unknown>) => ({
  id: String(o.name), competitorId: 'b1', businessName: 'Brazos Air', self: false, name: 'Open house', startDate: '2026-11-13', startsAt: '2026-11-13T16:00:00.000Z', status: 'scheduled',
  sources: ['google_panel'], url: null, ticketed: false, firstSeenAt: '2026-11-01T00:00:00.000Z', evidenceId: null, ...o,
});
const view = (events: unknown[]) => ({ events, windowStart: '2026-11-12', windowEnd: '2027-01-11' });
const visit = () => EventsPage({ params: Promise.resolve({ clientId: C }) });

beforeEach(() => {
  m.features = ['dashboard'];
  m.calls = [];
  m.events = view([
    ev({ name: 'Careers night', self: true, businessName: 'Lone Star Cooling', startsAt: null, sources: ['web'], url: 'https://lonestar.example/careers' }),
    ev({ name: 'Spring open house', sources: ['google_panel', 'web'], status: 'cancelled' }),
    ev({ name: 'Wine night', startDate: '2026-11-20', startsAt: '2026-11-20T01:30:00.000Z', sources: ['meta_ads'], status: 'sold_out' }),
    ev({ name: 'Moved class', startDate: '2026-11-20', status: 'postponed' }),
  ]);
});
afterEach(cleanup);

describe('EventsPage', () => {
  it('reads the profile and the events via tools for the client; titled Events with the decided sub-line', async () => {
    render(await visit());
    expect(m.calls.map(([n]) => n).sort()).toEqual(['get_client_profile', 'list_listed_events']);
    expect(m.calls.every(([, i]) => (i as { clientId: string }).clientId === C)).toBe(true);
    const header = screen.getByTestId('page-header');
    expect([header.dataset.title, header.dataset.tone]).toEqual(['Events', 'ink']);
    expect(screen.getByText('Upcoming events you and your rivals list, from Google and websites, for the next 60 days.')).toBeTruthy();
  });

  it('one section per date, headed with the weekday', async () => {
    render(await visit());
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Friday, November 13', 'Friday, November 20']);
    const first = within(screen.getByRole('heading', { name: 'Friday, November 13' }).closest('section')!);
    expect(first.getAllByRole('listitem')).toHaveLength(2);
  });

  it('rows: business (you first), linked name, time in the viewer zone or "Time not listed", source tags, status chip', async () => {
    render(await visit());
    const rows = within(screen.getByRole('heading', { name: 'Friday, November 13' }).closest('section')!).getAllByRole('listitem');
    expect(rows[0]!.textContent).toContain('Lone Star Cooling (you)');
    expect(rows[0]!.textContent).toContain('Time not listed');
    expect(rows[0]!.textContent).toContain('Website');
    const link = within(rows[0]!).getByRole('link', { name: 'Careers night' });
    expect([link.getAttribute('href'), link.getAttribute('target'), link.getAttribute('rel')]).toEqual(['https://lonestar.example/careers', '_blank', 'noopener noreferrer']);
    expect(within(rows[1]!).queryByRole('link')).toBeNull();
    expect(rows[1]!.textContent).toContain('10:00 AM');
    expect(rows[1]!.textContent).toContain('Google');
    expect(rows[1]!.textContent).toContain('Website');
  });

  it('chip labels per status, source labels per source', async () => {
    render(await visit());
    const chips = screen.getAllByText(/^(Scheduled|Cancelled|Postponed|Sold out)$/);
    expect(chips.map((c) => c.textContent)).toEqual(['Scheduled', 'Cancelled', 'Sold out', 'Postponed']);
    expect(screen.getAllByText('Meta ad')).toHaveLength(1);
    expect(screen.getByText('Sold out').closest('[data-slot=status-chip]')).toBeTruthy();
  });

  it('empty: the decided copy, verbatim, still with the header', async () => {
    m.events = view([]);
    render(await visit());
    expect(screen.getByText('No upcoming events found for you or your rivals yet.')).toBeTruthy();
    expect(screen.getByTestId('page-header')).toBeTruthy();
  });

  it('without the dashboard feature the page is a 404', async () => {
    m.features = [];
    await expect(visit()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
