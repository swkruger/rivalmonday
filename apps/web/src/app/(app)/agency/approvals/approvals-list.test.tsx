// @vitest-environment jsdom
import { createAccessContext } from '@cs/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-provider';

const A = '11111111-1111-4111-8111-111111111111';
const m = vi.hoisted(() => ({ items: [] as unknown[] }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: createAccessContext({ agencyId: A, userId: 'u', role: 'agency_admin', clientScope: 'all', features: ['dashboard'] as never }) }) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set<string>() }));
vi.mock('@/server/tools', () => ({ callTool: async () => ({ items: m.items }) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, usePathname: () => '/agency/approvals', useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
const { default: Page } = await import('./page');

const row = (status: string, over: Record<string, unknown> = {}) => ({ briefId: `b-${status}`, clientId: 'c', clientName: `Client ${status}`, deliveryDate: '2026-10-12', status, kind: 'weekly', activeItems: 2, droppedItems: 0, touched: false, autoSend: false, ...over });
const show = async () => render(<HelpProvider value={{ audience: 'agency', names: { assistant: 'Sunny' }, tips: {}, empty: {}, glossary: [] } as never}>{await Page()}</HelpProvider>);

afterEach(cleanup);

describe('approvals list (15c-2a)', () => {
  it('approvals statuses are chips with labels', async () => {
    m.items = [row('ready'), row('approved'), row('sent'), row('failed'), row('generating')];
    await show();
    for (const label of ['Ready for review', 'Approved', 'Sent', 'Failed — retrying', 'Drafting']) expect(screen.getByText(label), label).toBeTruthy();
    expect(screen.getAllByText('Week of Oct 12').length).toBe(5);
    expect(screen.queryByText('Nothing is waiting for your review')).toBeNull();
  });
  it('last header cell has an accessible name', async () => {
    m.items = [row('ready')];
    await show();
    const headers = screen.getAllByRole('columnheader');
    expect(headers.at(-1)!.textContent).toBe('Actions');
  });
  it('says nothing is waiting when no brief is ready, and nothing this week when the list is empty', async () => {
    m.items = [row('sent')];
    await show();
    expect(screen.getByText(/Nothing is waiting for your review/)).toBeTruthy();
    cleanup();
    m.items = [];
    await show();
    expect(screen.getByText('No briefs this week')).toBeTruthy();
  });
});
