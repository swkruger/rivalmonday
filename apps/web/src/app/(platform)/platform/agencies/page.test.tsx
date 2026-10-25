// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-provider';

const m = vi.hoisted(() => ({ calls: [] as [string, unknown][], answer: {} as unknown, role: 'owner' as string }));
vi.mock('@/server/current-viewer', () => ({ requireOperatorContext: async () => ({ viewer: { kind: 'user' }, ctx: { userId: 'op' } }) }));
vi.mock('@/server/tools', () => ({
  callTool: async (_c: unknown, name: string, input: unknown) => {
    m.calls.push([name, input]);
    return name === 'list_help_guides' ? { guides: [] } : m.answer;
  },
  tryCallTool: async () => ({ guides: [] }),
}));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/runtime-env', () => ({ platformAdmins: () => [] }));
vi.mock('@cs/tools', () => ({ platformRole: async () => m.role }));
vi.mock('@/server/run-tool', () => ({ runTool: vi.fn() }));
vi.mock('@/server/viewer-tz', () => ({ viewerTimeZone: async () => 'UTC' }));
vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/platform/agencies', useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

const { default: Agencies } = await import('./page');

const show = async (sp: Record<string, string>) =>
  render(<HelpProvider value={{ audience: 'operator', names: { agency: 'your agency', assistant: 'Sunny' } }}>{await Agencies({ searchParams: Promise.resolve(sp) })}</HelpProvider>);

beforeEach(() => { m.calls = []; m.role = 'owner'; });
afterEach(cleanup);

describe('platform agencies page', () => {
  it('prev link keeps q and sort', async () => {
    m.answer = { rows: [], nextCursor: 'NEXT', prevCursor: 'PREV' };
    await show({ q: 'ac', sort: 'spend', dir: 'asc', cursor: 'CUR' });
    expect(screen.getByRole('link', { name: /Previous/ }).getAttribute('href')).toBe('/platform/agencies?q=ac&sort=spend&dir=asc&cursor=PREV');
    expect(screen.getByRole('link', { name: /Next/ }).getAttribute('href')).toBe('/platform/agencies?q=ac&sort=spend&dir=asc&cursor=NEXT');
    expect(m.calls.find(([n]) => n === 'list_platform_agencies')![1]).toEqual({ sort: 'spend', dir: 'asc', query: 'ac', cursor: 'CUR' });
  });

  it('no results copy shows the query', async () => {
    m.answer = { rows: [], nextCursor: null, prevCursor: null };
    await show({ q: 'zzz' });
    expect(screen.getByText('No agencies match “zzz”.')).toBeTruthy();
  });

  it('has a labelled search form that keeps sort and dir', async () => {
    m.answer = { rows: [], nextCursor: null, prevCursor: null };
    await show({ sort: 'wau', dir: 'desc' });
    const form = screen.getByRole('search');
    expect(screen.getByLabelText('Search agencies').id).toBe('agency-q');
    expect((form.querySelector('input[name=sort]') as HTMLInputElement).value).toBe('wau');
    expect((form.querySelector('input[name=dir]') as HTMLInputElement).value).toBe('desc');
    expect(m.calls.find(([n]) => n === 'list_platform_agencies')![1]).toEqual({ sort: 'wau', dir: 'desc' });
  });

  it('passes the status to the tool, shows the counts and keeps status in links', async () => {
    m.answer = { rows: [], nextCursor: 'NEXT', prevCursor: null, counts: { onHold: 2, archived: 5 } };
    await show({ status: 'on_hold' });
    expect(m.calls.find(([n]) => n === 'list_platform_agencies')![1]).toEqual({ sort: 'name', dir: 'asc', status: 'on_hold' });
    expect(screen.getByRole('link', { name: 'On hold 2' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Archived 5' }).getAttribute('href')).toBe('/platform/agencies?status=archived&sort=name&dir=asc');
    expect(screen.getByRole('link', { name: 'Active' }).getAttribute('href')).toBe('/platform/agencies?sort=name&dir=asc');
    expect(screen.getByRole('link', { name: /Next/ }).getAttribute('href')).toBe('/platform/agencies?status=on_hold&sort=name&dir=asc&cursor=NEXT');
  });

  it('an unknown status falls back to active (no status sent)', async () => {
    m.answer = { rows: [], nextCursor: null, prevCursor: null, counts: { onHold: 0, archived: 0 } };
    await show({ status: 'bogus' });
    expect(m.calls.find(([n]) => n === 'list_platform_agencies')![1]).toEqual({ sort: 'name', dir: 'asc' });
  });

  it('archived rows show Unarchive for the owner only', async () => {
    const rows = [{ id: 'a1', name: 'Gone', createdAt: '2026-01-01T00:00:00Z', clientsActive: 1, clientsProspect: 0, agencySeats: 0, clientSeats: 0, wau: null, lastActivityAt: null, spendMonthUsd: 0, health: 'idle', billingState: 'pilot', onHold: false, archivedAt: '2026-01-02T00:00:00Z' }];
    m.answer = { rows, nextCursor: null, prevCursor: null, counts: { onHold: 0, archived: 1 } };
    const { unmount } = await show({ status: 'archived' });
    expect(screen.getByRole('button', { name: 'Unarchive' })).toBeTruthy();
    unmount();
    m.role = 'staff';
    await show({ status: 'archived' });
    expect(screen.queryByRole('button', { name: 'Unarchive' })).toBeNull();
  });
});
