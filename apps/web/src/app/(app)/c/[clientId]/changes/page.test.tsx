// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
const listDetail = vi.fn();
const E1 = '00000000-0000-4000-8000-0000000000e1';
const E2 = '00000000-0000-4000-8000-0000000000e2';
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: 'agency_admin', userId: 'u1', features: new Set(['dashboard']), permissions: new Set() } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), tryCallTool: (...a: unknown[]) => callTool(...a) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set() }));
vi.mock('@/server/verticals', () => ({ verticalOptions: async () => [] }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('@/components/page-header', () => ({ PageHeader: () => null }));
vi.mock('@/components/help/empty-state', () => ({ EmptyState: () => null }));
vi.mock('@/components/help/help-context', () => ({ HelpText: () => null }));
vi.mock('./feed', () => ({ FeedList: () => null, FilterBar: () => null }));
vi.mock('./viewer', () => ({ EventViewer: () => null }));
vi.mock('@/components/list-detail', () => ({ ListDetail: (p: unknown) => { listDetail(p); return null; } }));

import ChangesPage from './page';

const row = (eventId: string) => ({ eventId, channels: [], occurredAt: '2026-10-20T00:00:00.000Z' });
const mount = () =>
  callTool.mockImplementation(async (_c: unknown, name: string) => {
    if (name === 'get_client_profile') return { id: 'c1', name: 'Cool Air', verticalId: 'v', services: [], timezone: 'UTC' };
    if (name === 'search_events') return { items: [row(E1), row(E2)], hasMore: false };
    if (name === 'list_client_competitors') return { items: [] };
    if (name === 'get_event') return { eventId: E1, changes: [] };
    throw new Error(`unexpected ${name}`);
  });
const go = async (sp: Record<string, string> = {}) => {
  render(await ChangesPage({ params: Promise.resolve({ clientId: 'c1' }), searchParams: Promise.resolve(sp) }));
  return listDetail.mock.calls[0]![0] as Record<string, unknown>;
};

describe('ChangesPage ListDetail', () => {
  beforeEach(() => { callTool.mockReset(); listDetail.mockReset(); mount(); });

  it('bare visit passes sheetOpen false with the first event selected', async () => {
    const p = await go();
    expect(p.sheetOpen).toBe(false);
    expect(p.selectedId).toBe(E1);
    expect(p.listLabel).toBe('Changes');
    expect(p.detailTitle).toBe('Change details');
  });

  it('?event= passes sheetOpen true', async () => {
    const p = await go({ event: E2 });
    expect(p.sheetOpen).toBe(true);
    expect(p.selectedId).toBe(E2);
  });

  it('closeHref keeps filters and drops event, change, tab', async () => {
    const p = await go({ event: E2, change: E1, tab: 'text', route: 'all', days: '90' });
    const href = String(p.closeHref);
    expect(href).toContain('route=all');
    expect(href).toContain('days=90');
    expect(href).not.toMatch(/event=|change=|tab=/);
  });
});

describe('ChangesPage list container', () => {
  beforeEach(() => { callTool.mockReset(); listDetail.mockReset(); mount(); });
  it('the list is not wrapped in a card', async () => {
    const p = await go();
    const { container } = render(<>{p.list as React.ReactNode}</>);
    expect(container.querySelector('[data-slot=card]')).toBeNull();
  });
});
