// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: { kind: 'user' }, ctx: { role: 'account_manager' } }) }));
vi.mock('@/server/tools', () => ({ callTool: async (_c: unknown, name: string) => (name === 'get_usage' ? { month: 'October 2026', items: m.items, agencyLevelUsd: null } : { items: [] }) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set<string>() }));
vi.mock('./actions', () => ({ saveLimitsAction: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
const { default: Page } = await import('./page');

afterEach(cleanup);

describe('/agency/settings/usage', () => {
  it('usage shows the empty state with zero clients', async () => {
    m.items = [];
    render(await Page());
    expect(screen.getByText('No clients to show yet')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('lists clients in a table and labels a prospect with a status chip', async () => {
    m.items = [{ clientId: 'c1', name: 'Lone Star Air', status: 'prospect', spend: { monthToDateUsd: 1, capUsd: 10, level: 'ok' }, competitors: 2, competitorLimit: 5, questions: { used: 0, quota: 10 } }];
    render(await Page());
    expect(screen.queryByText('No clients to show yet')).toBeNull();
    expect(screen.getByText('Prospect')).toBeTruthy();
  });
});
