// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
const listDetail = vi.fn();
const M1 = '00000000-0000-4000-8000-0000000000a1';
const M2 = '00000000-0000-4000-8000-0000000000a2';
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: 'agency_admin', features: new Set(['dashboard']) } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), tryCallTool: (...a: unknown[]) => callTool(...a) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set() }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('@/components/page-header', () => ({ PageHeader: () => null }));
vi.mock('@/components/help/empty-state', () => ({ EmptyState: () => null }));
vi.mock('@/components/help/help-context', () => ({ HelpText: () => null }));
vi.mock('@/components/help/help-tip', () => ({ HelpTip: () => null }));
vi.mock('./move-card', () => ({ MoveCard: () => null, movesHref: (id: string, p: { status?: string; move?: string } = {}) => `/c/${id}/moves${p.status && p.status !== 'open' ? `?status=${p.status}` : ''}` }));
vi.mock('@/components/list-detail', () => ({ ListDetail: (p: unknown) => { listDetail(p); return null; } }));

import MovesPage from './page';

mount();
function mount() {
  callTool.mockImplementation(async (_c: unknown, name: string) => {
    if (name === 'get_client_profile') return { id: 'c1', name: 'Cool Air', timezone: 'UTC' };
    if (name === 'list_moves') return { items: [{ id: M1 }, { id: M2 }] };
    if (name === 'get_move') return { id: M1, label: 'x', competitorName: 'y', facts: [], events: [], firstDetectedAt: '2026-10-01T00:00:00.000Z', confidence: 0.5 };
    throw new Error(`unexpected ${name}`);
  });
}
const go = async (sp: Record<string, string> = {}) => {
  render(await MovesPage({ params: Promise.resolve({ clientId: 'c1' }), searchParams: Promise.resolve(sp) }));
  return listDetail.mock.calls[0]![0] as Record<string, unknown>;
};

describe('MovesPage ListDetail', () => {
  beforeEach(() => { callTool.mockReset(); listDetail.mockReset(); mount(); });

  it('bare visit passes sheetOpen false with the first move selected', async () => {
    const p = await go();
    expect(p.sheetOpen).toBe(false);
    expect(p.selectedId).toBe(M1);
    expect(p.listLabel).toBe('Moves');
    expect(p.detailTitle).toBe('Move details');
  });

  it('?move= passes sheetOpen true', async () => {
    const p = await go({ move: M2 });
    expect(p.sheetOpen).toBe(true);
    expect(p.selectedId).toBe(M2);
  });

  it('closeHref keeps status and drops move', async () => {
    const p = await go({ move: M2, status: 'closed' });
    expect(p.closeHref).toBe('/c/c1/moves?status=closed');
  });
});
