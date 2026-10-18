// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: 'client_owner' } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), tryCallTool: (...a: unknown[]) => callTool(...a) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import ReportPage, { generateMetadata } from './page';

const C = '00000000-0000-4000-8000-0000000000c1';
const summary = (id: string, quarter: string) => ({ id, clientId: C, quarter, status: 'sent', sentAt: '2026-10-01T15:00:00.000Z', hasPdf: true });
const detail = (id: string, quarter: string, clientId = C) => ({
  ...summary(id, quarter), clientId, periodStart: '2026-07-01T00:00:00.000Z', periodEnd: '2026-09-30T00:00:00.000Z', data: null,
});
const list = [summary('r3', '2026-Q3'), summary('r2', '2026-Q2'), summary('r1', '2026-Q1')];

const mount = (report = detail('r2', '2026-Q2')) =>
  callTool.mockImplementation(async (_ctx: unknown, name: string) => {
    if (name === 'get_client_profile') return { id: C, name: 'Cool Air', timezone: 'UTC' };
    if (name === 'get_trend_report') return report;
    if (name === 'list_trend_reports') return { items: list };
    throw new Error(`unexpected ${name}`);
  });
const show = async (reportId: string) => render(await ReportPage({ params: Promise.resolve({ clientId: C, reportId }) }));

describe('Report page (15a §2.8)', () => {
  beforeEach(() => { callTool.mockReset(); });

  it('one h1 naming the quarter, breadcrumb client › Briefs & reports (reports tab) › quarter', async () => {
    mount();
    await show('r2');
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Competitor trends — 2026-Q2']);
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Cool Air' }).getAttribute('href')).toBe(`/c/${C}`);
    expect(within(crumbs).getByRole('link', { name: 'Briefs & reports' }).getAttribute('href')).toBe(`/c/${C}/briefs?tab=reports`);
    expect(crumbs.textContent).toContain('2026-Q2');
    expect(await generateMetadata({ params: Promise.resolve({ clientId: C, reportId: 'r2' }) })).toEqual({ title: 'Competitor trends — 2026-Q2' });
  });

  it('Previous / Next by quarter from list_trend_reports, hidden at the ends', async () => {
    mount();
    const { unmount } = await show('r2');
    expect(callTool.mock.calls.find((c) => c[1] === 'list_trend_reports')![2]).toEqual({ clientId: C });
    expect(screen.getByRole('link', { name: '‹ Previous' }).getAttribute('href')).toBe(`/c/${C}/reports/r1`);
    expect(screen.getByRole('link', { name: 'Next ›' }).getAttribute('href')).toBe(`/c/${C}/reports/r3`);
    unmount();
    mount(detail('r1', '2026-Q1'));
    await show('r1');
    expect(screen.queryByRole('link', { name: '‹ Previous' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Next ›' }).getAttribute('href')).toBe(`/c/${C}/reports/r2`);
  });

  it('404s on another client’s report', async () => {
    mount(detail('r2', '2026-Q2', '00000000-0000-4000-8000-0000000000ff'));
    await expect(ReportPage({ params: Promise.resolve({ clientId: C, reportId: 'r2' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
