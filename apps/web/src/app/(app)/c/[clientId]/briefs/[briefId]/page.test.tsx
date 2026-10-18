// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
const viewer = vi.hoisted(() => ({ role: 'client_owner' }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: viewer.role } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), tryCallTool: (...a: unknown[]) => callTool(...a) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import BriefPage, { generateMetadata } from './page';

const C = '00000000-0000-4000-8000-0000000000c1';
const summary = (id: string, deliveryDate: string) => ({ id, clientId: C, deliveryDate, status: 'sent', kind: 'weekly', summary: 's', sentAt: null, hasPdf: false, generatedAt: null });
const detail = (id: string, deliveryDate: string, kind = 'weekly') => ({
  ...summary(id, deliveryDate), kind, periodStart: '2026-10-01T00:00:00.000Z', periodEnd: '2026-10-08T00:00:00.000Z', approvedAt: null,
  scorecard: null, trend: null, items: [], summary: `Summary of ${id}`,
});
const list = [summary('b3', '2026-10-20'), summary('b2', '2026-10-13'), summary('b1', '2026-10-06')];

const mount = (brief = detail('b2', '2026-10-13')) =>
  callTool.mockImplementation(async (_ctx: unknown, name: string) => {
    if (name === 'get_client_profile') return { id: C, name: 'Cool Air', timezone: 'UTC' };
    if (name === 'get_brief') return brief;
    if (name === 'list_briefs') return { items: list, nextCursor: null };
    throw new Error(`unexpected ${name}`);
  });
const show = async (briefId: string) => render(await BriefPage({ params: Promise.resolve({ clientId: C, briefId }) }));

describe('Brief page (15a §2.8)', () => {
  beforeEach(() => { callTool.mockReset(); viewer.role = 'client_owner'; });

  it('one h1 naming the week, breadcrumb client › Briefs & reports › date, both neighbours from list_briefs at its max', async () => {
    mount();
    await show('b2');
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Week of Oct 13, 2026']);
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Cool Air' }).getAttribute('href')).toBe(`/c/${C}`);
    expect(within(crumbs).getByRole('link', { name: 'Briefs & reports' }).getAttribute('href')).toBe(`/c/${C}/briefs`);
    expect(crumbs.textContent).toContain('Oct 13, 2026');
    expect(callTool.mock.calls.find((c) => c[1] === 'list_briefs')![2]).toEqual({ clientId: C, limit: 52 });
    expect(screen.getByRole('link', { name: '‹ Previous' }).getAttribute('href')).toBe(`/c/${C}/briefs/b1`);
    expect(screen.getByRole('link', { name: 'Next ›' }).getAttribute('href')).toBe(`/c/${C}/briefs/b3`);
    expect(screen.queryByRole('link', { name: 'Open in approvals' })).toBeNull();
  });

  it('the newest brief has no Next, the oldest no Previous', async () => {
    mount(detail('b3', '2026-10-20'));
    const { unmount } = await show('b3');
    expect(screen.queryByRole('link', { name: 'Next ›' })).toBeNull();
    expect(screen.getByRole('link', { name: '‹ Previous' })).toBeTruthy();
    unmount();
    mount(detail('b1', '2026-10-06'));
    await show('b1');
    expect(screen.queryByRole('link', { name: '‹ Previous' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Next ›' })).toBeTruthy();
  });

  it('agency roles get "Open in approvals"', async () => {
    viewer.role = 'agency_admin';
    mount();
    await show('b2');
    expect(screen.getByRole('link', { name: 'Open in approvals' }).getAttribute('href')).toBe('/agency/approvals/b2');
  });

  it('a starting point is titled as such; the tab title matches the h1', async () => {
    mount(detail('b2', '2026-10-13', 'starting_point'));
    await show('b2');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your starting point');
    expect(await generateMetadata({ params: Promise.resolve({ clientId: C, briefId: 'b2' }) })).toEqual({ title: 'Your starting point' });
  });

  it("404s on another client's brief", async () => {
    mount({ ...detail('b2', '2026-10-13'), clientId: '00000000-0000-4000-8000-0000000000ff' });
    await expect(BriefPage({ params: Promise.resolve({ clientId: C, briefId: 'b2' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
