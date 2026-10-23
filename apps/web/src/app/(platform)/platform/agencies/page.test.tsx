// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-provider';

const m = vi.hoisted(() => ({ calls: [] as [string, unknown][], answer: {} as unknown }));
vi.mock('@/server/current-viewer', () => ({ requireOperatorContext: async () => ({ viewer: { kind: 'user' }, ctx: { userId: 'op' } }) }));
vi.mock('@/server/tools', () => ({
  callTool: async (_c: unknown, name: string, input: unknown) => {
    m.calls.push([name, input]);
    return name === 'list_help_guides' ? { guides: [] } : m.answer;
  },
  tryCallTool: async () => ({ guides: [] }),
}));
vi.mock('@/server/viewer-tz', () => ({ viewerTimeZone: async () => 'UTC' }));
vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/platform/agencies', useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

const { default: Agencies } = await import('./page');

const show = async (sp: Record<string, string>) =>
  render(<HelpProvider value={{ audience: 'operator', names: { agency: 'your agency', assistant: 'Sunny' } }}>{await Agencies({ searchParams: Promise.resolve(sp) })}</HelpProvider>);

beforeEach(() => { m.calls = []; });
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
});
