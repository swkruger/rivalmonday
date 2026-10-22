// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: 'client_owner' } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), tryCallTool: (...a: unknown[]) => callTool(...a) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import AlertPage, { generateMetadata } from './page';

const C = '00000000-0000-4000-8000-0000000000c1';
const summary = (id: string) => ({ id, clientId: C, competitorName: 'Smith HVAC', headline: `Headline ${id}`, score: 80, status: 'delivered', createdAt: '2026-10-14T02:00:00.000Z', deliveredAt: null });
const detail = (id: string, clientId = C) => ({ ...summary(id), clientId, body: 'Body.', evidenceIds: [], written: null });
const list = [summary('a3'), summary('a2'), summary('a1')];

const mount = (alert = detail('a2'), items: unknown[] | null = list) =>
  callTool.mockImplementation(async (_ctx: unknown, name: string) => {
    if (name === 'get_client_profile') return { id: C, name: 'Cool Air', timezone: 'America/Chicago' };
    if (name === 'get_alert') return alert;
    if (name === 'list_alerts') return items ? { items, nextCursor: null } : null;
    throw new Error(`unexpected ${name}`);
  });
const show = async (alertId: string) => render(await AlertPage({ params: Promise.resolve({ clientId: C, alertId }) }));

// The date formatter omits the current year, so pin "now" (Date only; timers stay real).
beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-21T12:00:00Z')); });
afterAll(() => { vi.useRealTimers(); });

describe('Alert page (15a §2.8)', () => {
  beforeEach(() => { callTool.mockReset(); });

  it('one h1 (the headline), breadcrumb client › Briefs & reports (alerts tab) › date in the client time zone', async () => {
    mount();
    await show('a2');
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Headline a2']);
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByRole('link', { name: 'Cool Air' }).getAttribute('href')).toBe(`/c/${C}`);
    expect(within(crumbs).getByRole('link', { name: 'Briefs & reports' }).getAttribute('href')).toBe(`/c/${C}/briefs?tab=alerts`);
    expect(crumbs.textContent).toContain('Oct 13'); // 02:00 UTC on the 14th is the 13th in Chicago
    expect(await generateMetadata({ params: Promise.resolve({ clientId: C, alertId: 'a2' }) })).toEqual({ title: 'Headline a2' });
  });

  it('Previous / Next from list_alerts at its max (100), hidden at the ends', async () => {
    mount();
    const { unmount } = await show('a2');
    expect(callTool.mock.calls.find((c) => c[1] === 'list_alerts')![2]).toEqual({ clientId: C, limit: 100 });
    expect(screen.getByRole('link', { name: '‹ Previous' }).getAttribute('href')).toBe(`/c/${C}/alerts/a1`);
    expect(screen.getByRole('link', { name: 'Next ›' }).getAttribute('href')).toBe(`/c/${C}/alerts/a3`);
    unmount();
    mount(detail('a3'));
    await show('a3');
    expect(screen.queryByRole('link', { name: 'Next ›' })).toBeNull();
    expect(screen.getByRole('link', { name: '‹ Previous' }).getAttribute('href')).toBe(`/c/${C}/alerts/a2`);
  });

  it('a refused neighbour list hides both links', async () => {
    mount(detail('a2'), null);
    await show('a2');
    expect(screen.queryByRole('navigation', { name: 'Previous and next' })).toBeNull();
  });

  it('404s on another client’s alert', async () => {
    mount(detail('a2', '00000000-0000-4000-8000-0000000000ff'));
    await expect(AlertPage({ params: Promise.resolve({ clientId: C, alertId: 'a2' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
