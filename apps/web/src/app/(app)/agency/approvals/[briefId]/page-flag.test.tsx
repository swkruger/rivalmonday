// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelpProvider } from '@/components/help/help-provider';

const m = vi.hoisted(() => ({ brief: {} as Record<string, unknown> }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: 'agency_admin', features: new Set() } }) }));
vi.mock('@/server/tools', () => ({ callTool: async () => m.brief }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set<string>() }));
vi.mock('@/server/evidence-refs', () => ({ evidenceRefsFor: async () => new Map() }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, usePathname: () => '/agency/approvals/b', useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('./actions', () => ({ editItemAction: vi.fn(), dropItemAction: vi.fn(), moveItemAction: vi.fn(), rateItemAction: vi.fn(), approveAction: vi.fn(), sendNowAction: vi.fn(), autoSendAction: vi.fn() }));
if (typeof globalThis.ResizeObserver === 'undefined') globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
const { default: Page } = await import('./page');

const brief = (over: Record<string, unknown>) => ({
  id: 'b', clientId: 'c', clientName: 'A1 HVAC', clientTimezone: 'UTC', kind: 'weekly', deliveryDate: '2026-10-12', status: 'ready', summary: 'Rivals went cheap this week.', autoSend: false, touched: false,
  factCheck: { items: 0, sentences: 0 }, scorecard: null, reviewReason: null, reviewTerms: null,
  items: [{ id: 'i1', ord: 1, competitorId: 'x', subject: 'competitor', competitorName: 'Smith', headline: 'Cheap tune-ups', whatChanged: 'w', whyItMatters: 'y', recommendedAction: 'r', confidence: 0.9, effort: 'L', impact: 'H', evidenceIds: [], status: 'active', upsellTag: null }], ...over,
});
const show = async () => {
  const ui = await Page({ params: Promise.resolve({ briefId: 'b' }) });
  return render(<HelpProvider value={{ audience: 'agency', names: { assistant: 'Sunny' }, tips: {}, empty: {}, glossary: [] } as never}>{ui}</HelpProvider>);
};
afterEach(cleanup);

describe('brief detail review flag (13a2 task 9)', () => {
  it('brief detail shows the band and marks the terms in summary and items', async () => {
    m.brief = brief({ reviewReason: 'banned_term', reviewTerms: ['cheap'] });
    const { container } = await show();
    expect(screen.getByText('This brief uses a banned word: cheap. Auto-send skips it; edit it or approve it as it is.')).toBeTruthy();
    expect([...container.querySelectorAll('mark')].map((x) => x.textContent)).toEqual(['cheap', 'Cheap']);
  });
  it('shows no band once the brief is no longer ready (V8)', async () => {
    m.brief = brief({ status: 'approved', reviewReason: 'banned_term', reviewTerms: ['cheap'] });
    const { container } = await show();
    expect(screen.queryByText(/uses a banned word/)).toBeNull();
    expect(container.querySelectorAll('mark').length).toBe(0);
  });
});
