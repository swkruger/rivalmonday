// Launch-gate 6a: the viewer's reads start as soon as their ids are known, and an out-of-scope client still 404s.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
const E1 = '00000000-0000-4000-8000-0000000000e1';
const CH1 = '00000000-0000-4000-8000-0000000000d1';
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: 'agency_admin', userId: 'u1', features: new Set(['dashboard']), permissions: new Set() } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), tryCallTool: (...a: unknown[]) => callTool(...a), registry: vi.fn() }));
vi.mock('@/server/help', () => ({ helpGuides: (...a: unknown[]) => callTool(null, 'help', ...a) }));
vi.mock('@/server/verticals', () => ({ verticalOptions: async () => [] }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import ChangesPage from './page';

const visit = (sp: Record<string, string> = {}) => ChangesPage({ params: Promise.resolve({ clientId: 'c1' }), searchParams: Promise.resolve(sp) });
const flush = () => new Promise((r) => setTimeout(r, 0));
const argsOf = (name: string) => callTool.mock.calls.find((c) => c[1] === name)?.[2];

describe('ChangesPage reads (launch-gate 6a)', () => {
  beforeEach(() => { callTool.mockReset(); });

  it('starts get_event on the first feed row and compare_snapshots on its first change, before the other reads settle', async () => {
    callTool.mockImplementation((_c: unknown, name: string) => {
      if (name === 'search_events') return Promise.resolve({ items: [{ eventId: E1, channels: [], occurredAt: '2026-10-20T00:00:00.000Z' }], hasMore: false });
      if (name === 'get_event') return Promise.resolve({ eventId: E1, changes: [{ changeId: CH1 }] });
      return new Promise(() => {}); // profile, competitors, guides and the comparison never settle here
    });
    void visit();
    await flush();
    expect(argsOf('get_event')).toEqual({ clientId: 'c1', eventId: E1 });
    expect(argsOf('compare_snapshots')).toEqual({ clientId: 'c1', changeId: CH1 });
  });

  it('a bookmarked ?event= is read at once, without waiting for the feed', async () => {
    callTool.mockImplementation(() => new Promise(() => {}));
    void visit({ event: E1 });
    await flush();
    expect(argsOf('get_event')).toEqual({ clientId: 'c1', eventId: E1 });
  });

  it('an out-of-scope client still 404s, with no unhandled rejections', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    callTool.mockImplementation(async () => { throw new Error('NEXT_NOT_FOUND'); });
    for (const sp of [{}, { event: E1 }] as Record<string, string>[]) {
      const err = await visit(sp).then(() => null, (e: unknown) => e);
      expect((err as Error | null)?.message).toBe('NEXT_NOT_FOUND');
    }
    await new Promise((r) => setTimeout(r, 20));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
