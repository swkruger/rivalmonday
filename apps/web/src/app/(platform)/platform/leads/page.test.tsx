// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-provider';

const m = vi.hoisted(() => ({ calls: [] as [string, unknown][], answer: {} as Record<string, unknown> }));
vi.mock('@/server/current-viewer', () => ({ requireOperatorContext: async () => ({ viewer: { kind: 'user' }, ctx: { userId: 'op' } }) }));
vi.mock('@/server/tools', () => ({
  callTool: async (_c: unknown, name: string, input: unknown) => {
    m.calls.push([name, input]);
    return name === 'list_help_guides' ? { guides: [] } : m.answer;
  },
  tryCallTool: async () => ({ guides: [] }),
}));
vi.mock('@cs/tools', () => ({ platformRole: async () => 'owner' }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/runtime-env', () => ({ platformAdmins: () => [] }));
vi.mock('@/server/viewer-tz', () => ({ viewerTimeZone: async () => 'UTC' }));
vi.mock('@/server/verticals', () => ({ verticalOptions: async () => [{ id: 'dental', name: 'Dental practices', services: [] }] }));
vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('./actions', () => ({ assignLeadAction: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/platform/leads', useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

const { default: Leads } = await import('./page');

const lead = (over: Record<string, unknown> = {}) => ({
  id: 'l1', ref: null, businessName: 'Smith Dental', address: null, city: 'Austin', category: 'Dentist', contactName: 'Sam', email: 's@x.co', phone: null, message: null,
  verifiedAt: '2026-10-05T12:00:00.000Z', createdAt: '2026-10-01T12:00:00.000Z', declinedBack: false, ...over,
});
const show = async (sp: Record<string, string> = {}) =>
  render(<HelpProvider value={{ audience: 'operator', names: { agency: 'your agency', assistant: 'Sunny' } }}>{await Leads({ searchParams: Promise.resolve(sp) })}</HelpProvider>);

beforeEach(() => { m.calls = []; m.answer = { leads: [lead()], agencies: [{ id: 'a', name: 'Acme', verticals: ['dental'], activeClients: 1 }], recentAssignments: [], nextCursor: 'NEXT', prevCursor: 'PREV', total: 41 }; });
afterEach(cleanup);

describe('platform leads page', () => {
  it('titles the pool with the total, shows vertical names, and links Previous/Next', async () => {
    await show({ cursor: 'CUR' });
    expect(screen.getByText('Pool (41)')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Acme — Dental practices · 1 active client' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Previous/ }).getAttribute('href')).toBe('/platform/leads?cursor=PREV');
    expect(screen.getByRole('link', { name: /Next/ }).getAttribute('href')).toBe('/platform/leads?cursor=NEXT');
    expect(m.calls.find(([n]) => n === 'list_pool_leads')![1]).toEqual({ cursor: 'CUR' });
  });

  it('verified column shows — when not verified', async () => {
    m.answer = { ...m.answer, leads: [lead({ verifiedAt: null })] };
    await show();
    const row = screen.getByText('Smith Dental').closest('tr')!;
    expect(row.querySelectorAll('td')[2]!.textContent).toBe('—');
  });

  it('an empty page of a non-empty pool says so and links to the first page; an empty pool keeps its empty state', async () => {
    m.answer = { ...m.answer, leads: [], nextCursor: null, total: 2 };
    await show({ cursor: 'CUR' });
    expect(screen.getByText(/Nothing on this page\./)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to the first page' }).getAttribute('href')).toBe('/platform/leads');
    expect(screen.queryByText('The pool is empty')).toBeNull();
    cleanup();
    m.answer = { ...m.answer, leads: [], nextCursor: null, prevCursor: null, total: 0 };
    await show();
    expect(screen.getByText('The pool is empty')).toBeTruthy();
    expect(screen.queryByText(/Nothing on this page/)).toBeNull();
  });

  it('verified column shows the date in the viewer zone', async () => {
    await show();
    expect(screen.getByText(/^Oct 5/)).toBeTruthy();
  });
});
