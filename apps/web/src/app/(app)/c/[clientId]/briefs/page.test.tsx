// @vitest-environment jsdom
import { encodeCursor } from '@cs/tools';
import { render, screen, within } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
const viewer = vi.hoisted(() => ({ role: 'client_owner' }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: viewer.role } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), tryCallTool: (...a: unknown[]) => callTool(...a) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import BriefsPage from './page';

const C = '00000000-0000-4000-8000-0000000000c1';
const profile = { id: C, name: 'Cool Air', timezone: 'America/Chicago' };
const brief = (id: string, deliveryDate: string, status = 'sent', kind = 'weekly') => ({
  id, clientId: C, deliveryDate, status, kind, summary: `Summary ${id}`, sentAt: null, hasPdf: false, generatedAt: null,
});
const alert = (id: string, status = 'delivered') => ({
  id, clientId: C, competitorName: 'Smith HVAC', headline: `Headline ${id}`, score: 80, status, createdAt: '2026-10-14T02:00:00.000Z', deliveredAt: null,
});
const report = (id: string, quarter: string, status = 'sent') => ({ id, clientId: C, quarter, status, sentAt: '2026-10-01T15:00:00.000Z', hasPdf: true });

let lists: Record<string, { items: unknown[]; nextCursor?: string | null }> = {};
const mount = (l: typeof lists) => {
  lists = l;
  callTool.mockImplementation(async (_ctx: unknown, name: string) => (name === 'get_client_profile' ? profile : lists[name] ?? { items: [] }));
};
const show = async (sp: Record<string, string> = {}) => render(await BriefsPage({ params: Promise.resolve({ clientId: C }), searchParams: Promise.resolve(sp) }));
const views = () => screen.getByRole('navigation', { name: 'Briefs and reports views' });
const callOf = (name: string) => callTool.mock.calls.find((c) => c[1] === name)?.[2];

// The date formatter omits the current year, so pin "now" (Date only; timers stay real).
beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-21T12:00:00Z')); });
afterAll(() => { vi.useRealTimers(); });

describe('Briefs & reports (15a §2.8)', () => {
  beforeEach(() => { callTool.mockReset(); viewer.role = 'client_owner'; });

  it('defaults to Weekly briefs: the first page of list_briefs, rows dated "Oct 13" and linked to the brief', async () => {
    mount({ list_briefs: { items: [brief('b2', '2026-10-13'), brief('b1', '2026-10-06', 'sent', 'starting_point')], nextCursor: null } });
    await show();
    expect(screen.getByRole('heading', { level: 1, name: 'Briefs & reports' })).toBeTruthy();
    expect(callOf('list_briefs')).toEqual({ clientId: C, limit: 20 });
    expect(within(views()).getByRole('link', { name: 'Weekly briefs' }).getAttribute('aria-current')).toBe('page');
    expect(within(views()).getByRole('link', { name: 'Alerts' }).getAttribute('aria-current')).toBeNull();
    // The @cs/ui Tabs look, active state from aria-current (not a third tab style).
    expect(views().getAttribute('data-slot')).toBe('tabs-link-list');
    expect(within(views()).getAllByRole('link').map((l) => l.getAttribute('data-slot'))).toEqual(['tabs-link', 'tabs-link', 'tabs-link']);
    const row = screen.getByRole('link', { name: /Oct 13/ });
    expect(row.getAttribute('href')).toBe(`/c/${C}/briefs/b2`);
    expect(row.textContent).toContain('Summary b2');
    expect(screen.getByRole('link', { name: /Oct 6/ }).textContent).toContain('Starting point');
  });

  it('breadcrumb: client › Act › Briefs & reports', async () => {
    mount({});
    await show();
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Cool Air' }).getAttribute('href')).toBe(`/c/${C}`);
    expect(crumbs.textContent).toContain('Act');
  });

  it('switches tab by URL: ?tab=alerts lists alerts, ?tab=reports reports, anything else falls back to briefs', async () => {
    mount({ list_alerts: { items: [alert('a1')], nextCursor: null }, list_trend_reports: { items: [report('r1', '2026-Q3')] } });
    const { unmount } = await show({ tab: 'alerts' });
    expect(within(views()).getByRole('link', { name: 'Alerts' }).getAttribute('aria-current')).toBe('page');
    expect(within(views()).getByRole('link', { name: 'Quarterly reports' }).getAttribute('href')).toBe(`/c/${C}/briefs?tab=reports`);
    const row = screen.getByRole('link', { name: /Oct 13/ }); // 02:00 UTC on the 14th is the 13th in Chicago
    expect(row.getAttribute('href')).toBe(`/c/${C}/alerts/a1`);
    expect(row.textContent).toContain('Smith HVAC — Headline a1');
    expect(callTool.mock.calls.map((c) => c[1])).not.toContain('list_briefs');
    unmount();

    await show({ tab: 'reports' });
    expect(screen.getByRole('link', { name: /Competitor trends — 2026-Q3/ }).getAttribute('href')).toBe(`/c/${C}/reports/r1`);
    callTool.mockClear();
    await show({ tab: 'nope' });
    expect(callTool.mock.calls.map((c) => c[1])).toContain('list_briefs');
  });

  it('pages 20 at a time: page 2 asks for offset 20, "Newer" goes back, "Older" only while there is more', async () => {
    mount({ list_briefs: { items: [brief('b9', '2026-08-03')], nextCursor: encodeCursor(40) } });
    await show({ page: '2' });
    expect(callOf('list_briefs')).toEqual({ clientId: C, limit: 20, cursor: encodeCursor(20) });
    expect(screen.getByRole('link', { name: 'Newer' }).getAttribute('href')).toBe(`/c/${C}/briefs?tab=briefs`);
    expect(screen.getByRole('link', { name: 'Older' }).getAttribute('href')).toBe(`/c/${C}/briefs?tab=briefs&page=3`);
  });

  it('page 1 has no "Newer"; the last page no "Older"; a bad page number is page 1', async () => {
    mount({ list_alerts: { items: [alert('a1')], nextCursor: null } });
    await show({ tab: 'alerts', page: '-3' });
    expect(callOf('list_alerts')).toEqual({ clientId: C, limit: 20 });
    expect(screen.queryByRole('link', { name: 'Newer' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Older' })).toBeNull();
  });

  it('quarterly reports (one unpaged list) are paged on the page', async () => {
    const all = Array.from({ length: 25 }, (_, i) => report(`r${i}`, `20${String(i).padStart(2, '0')}-Q1`));
    mount({ list_trend_reports: { items: all } });
    await show({ tab: 'reports', page: '2' });
    expect(screen.getAllByRole('link', { name: /Competitor trends/ })).toHaveLength(5);
    expect(screen.getByRole('link', { name: 'Newer' }).getAttribute('href')).toBe(`/c/${C}/briefs?tab=reports`);
    expect(screen.queryByRole('link', { name: 'Older' })).toBeNull();
  });

  it('a client owner never sees a status chip; agency roles do (drafts included)', async () => {
    mount({ list_briefs: { items: [brief('b1', '2026-10-13', 'sent')], nextCursor: null } });
    const { unmount } = await show();
    expect(screen.queryByText('Sent')).toBeNull();
    unmount();

    viewer.role = 'account_manager';
    mount({ list_briefs: { items: [brief('b2', '2026-10-20', 'ready'), brief('b1', '2026-10-13', 'sent')], nextCursor: null } });
    await show();
    expect(screen.getByText('Ready for review')).toBeTruthy();
    expect(screen.getByText('Sent')).toBeTruthy();
  });

  it('briefs list: agency sees a "Ready for review" chip, client none', async () => {
    mount({ list_briefs: { items: [brief('b2', '2026-10-19', 'ready')], nextCursor: null } });
    const { container, unmount } = await show();
    expect(container.querySelector('[data-slot="status-chip"]')).toBeNull();
    unmount();
    viewer.role = 'account_manager';
    await show();
    expect(screen.getByText('Ready for review').getAttribute('data-slot')).toBe('status-chip');
  });

  it('starting point rows carry an info chip for everyone; the tab list wrapper is min-w-0', async () => {
    mount({ list_briefs: { items: [brief('b1', '2026-10-06', 'sent', 'starting_point')], nextCursor: null } });
    await show();
    expect(screen.getByText('Starting point').getAttribute('data-tone')).toBe('info');
    expect(views().parentElement!.className).toContain('min-w-0');
    expect(views().parentElement!.className).toContain('flex-wrap');
  });

  it.each([
    ['briefs', 'No weekly briefs yet', 'The first one arrives the Monday after setup is complete.'],
    ['alerts', 'No alerts yet', 'Alerts are sent when a competitor makes an urgent change.'],
    ['reports', 'No quarterly reports yet', 'A report arrives in the first week after each quarter ends, and covers that quarter.'],
  ] as const)('empty state for %s', async (tab, title, body) => {
    mount({});
    await show({ tab });
    expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    expect(screen.getByText(body)).toBeTruthy();
  });
});
