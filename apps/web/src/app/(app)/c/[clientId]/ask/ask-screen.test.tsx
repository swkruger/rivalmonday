// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const C = '44444444-4444-4444-8444-444444444444';
const EV1 = '00000000-0000-4000-8000-0000000000e1';
const EV2 = '00000000-0000-4000-8000-0000000000e2';
const m = vi.hoisted(() => ({ selects: 0, themeCalls: 0, refsCalls: [] as unknown[][] }));
// React's `cache` is a pass-through outside a server request; memoize by first argument like a request scope would.
vi.mock('react', async (orig) => ({
  ...(await orig<typeof import('react')>()),
  cache: <F extends (...a: never[]) => unknown>(fn: F): F => {
    const memo = new Map<unknown, unknown>();
    return ((...a: unknown[]) => {
      if (!memo.has(a[0])) memo.set(a[0], (fn as unknown as (...x: unknown[]) => unknown)(...a));
      return memo.get(a[0]);
    }) as unknown as F;
  },
}));
const viewer = { kind: 'user', userId: 'u1' };
vi.mock('@/server/current-viewer', () => ({
  requireContext: async () => ({ viewer, ctx: { agencyId: 'ag', userId: 'u1', role: 'agency_admin', clientScope: 'all', features: ['ask'], planFeatures: new Set(['ask']) } }),
}));
vi.mock('@/server/theme', () => ({ themeForViewer: async () => { m.themeCalls++; return { assistantName: 'Wrong' }; } }));
vi.mock('@/server/db', () => ({
  dbs: () => ({
    service: { select: () => ({ from: () => ({ where: async () => { m.selects++; return [{ branding: { assistantName: 'Sunny' } }]; } }) }) },
  }),
}));
vi.mock('@/server/tools', () => ({
  callTool: async (_c: unknown, tool: string) =>
    tool === 'get_client_profile' ? { name: 'Acme', timezone: 'America/Chicago' } : tool === 'get_my_ask_thread' ? { id: 'th', clientId: C, title: 'T', messages: [{ id: 'a', role: 'assistant', content: 'x', citations: [`ev:${EV1}`, `ev:${EV2}`, 'kb:z'], status: 'ok', action: null }, { id: 'b', role: 'assistant', content: 'y', citations: [`ev:${EV1}`], status: 'ok', action: null }] } : tool === 'get_ask_starters' ? { questions: [], reviewAllowed: false } : tool === 'list_my_ask_threads' ? { items: [] } : {},
}));
vi.mock('@/server/evidence-refs', () => ({ evidenceRefsFor: async (...a: unknown[]) => { m.refsCalls.push(a); return {}; } }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set() }));
vi.mock('@cs/mcp', () => ({ displayNameFor: async () => 'Acme Agency' }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('./actions', () => ({ askEvidenceRefs: vi.fn(), confirmAskAction: vi.fn(), deleteAskThreadAction: vi.fn(), saveAskRecommendation: vi.fn() }));
vi.mock('@/components/ask/ask-chat', () => ({ AskChat: () => null }));
vi.mock('@/components/ask/thread-list', () => ({ ThreadDrawer: () => null, ThreadList: () => <nav aria-label="Your questions" /> }));
const { askMetadata, AskScreen } = await import('./ask-screen');

describe('Ask screen', () => {
  it('reads the assistant name once per request', async () => {
    const meta = await askMetadata();
    expect(meta.title).toBe('Ask Sunny');
    await AskScreen({ clientId: C, threadId: null });
    expect(m.selects).toBe(1);
    expect(m.themeCalls).toBe(0);
  });

  it('resolves refs for every assistant message in one call and has no second complementary landmark', async () => {
    m.refsCalls.length = 0;
    const ui = await AskScreen({ clientId: C, threadId: 'th' });
    expect(m.refsCalls).toHaveLength(1);
    expect(m.refsCalls[0]!.slice(1)).toEqual([C, [EV1, EV2, EV1], 'America/Chicago']);
    render(ui);
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Your questions' })).toBeTruthy();
  });
});
