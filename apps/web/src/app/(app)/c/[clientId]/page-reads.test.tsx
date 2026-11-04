// Launch-gate 6a: the latest brief is read as soon as the brief list is in, and an out-of-scope client still 404s.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: { kind: 'user' }, ctx: { role: 'agency_admin', userId: 'u1', features: ['dashboard'] } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), tryCallTool: (...a: unknown[]) => callTool(...a), registry: vi.fn() }));
vi.mock('@/server/help', () => ({ helpGuides: (...a: unknown[]) => callTool(null, 'help', ...a) }));
vi.mock('@cs/core', async (orig) => ({ ...(await orig<typeof import('@cs/core')>()), hasFeature: () => true, hasPermission: () => false }));
vi.mock('@/components/ask/ask-card', () => ({ AskCard: () => null }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import ClientHome from './page';

const C = '00000000-0000-4000-8000-0000000000c1';
const visit = () => ClientHome({ params: Promise.resolve({ clientId: C }) });

describe('Client Overview reads (launch-gate 6a)', () => {
  beforeEach(() => { callTool.mockReset(); });

  it('starts get_brief for the latest brief before the rest of the batch settles', async () => {
    callTool.mockImplementation((_c: unknown, name: string) => {
      if (name === 'list_briefs') {
        return Promise.resolve({ items: [
          { id: 'b-old', kind: 'weekly', status: 'sent', deliveryDate: '2026-10-12', generatedAt: '2026-10-09T00:00:00Z', summary: '' },
          { id: 'b-new', kind: 'weekly', status: 'sent', deliveryDate: '2026-10-19', generatedAt: '2026-10-16T00:00:00Z', summary: '' },
        ] });
      }
      return new Promise(() => {});
    });
    void visit();
    await new Promise((r) => setTimeout(r, 0));
    expect(callTool.mock.calls.find((c) => c[1] === 'get_brief')?.[2]).toEqual({ briefId: 'b-new' });
  });

  it('an out-of-scope client still 404s, with no unhandled rejections', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    callTool.mockImplementation(async () => { throw new Error('NEXT_NOT_FOUND'); });
    const err = await visit().then(() => null, (e: unknown) => e);
    expect((err as Error | null)?.message).toBe('NEXT_NOT_FOUND');
    await new Promise((r) => setTimeout(r, 20));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
