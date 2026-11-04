// Launch-gate 6b: the ad list starts with the page's other reads; refusals still 404.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: 'client_owner', features: new Set(['dashboard']) } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), tryCallTool: (...a: unknown[]) => callTool(...a) }));
vi.mock('@/server/help', () => ({ helpGuides: (...a: unknown[]) => callTool(null, 'help', ...a) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));

import AdsPage from './page';

const visit = (sp: Record<string, string> = {}) => AdsPage({ params: Promise.resolve({ clientId: 'c' }), searchParams: Promise.resolve(sp) });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('AdsPage reads (launch-gate 6b)', () => {
  beforeEach(() => {
    callTool.mockReset();
    callTool.mockImplementation(() => new Promise(() => {}));
  });

  it('list_ads starts beside the profile, activity, competitors and guides', async () => {
    void visit({ platform: 'meta', status: 'all' });
    await flush();
    expect(callTool.mock.calls.map((c) => c[1])).toEqual(['get_client_profile', 'get_ad_activity', 'list_client_competitors', 'help', 'list_ads']);
    expect(callTool.mock.calls.at(-1)?.[2]).toEqual({ clientId: 'c', platform: 'meta', status: 'all', offset: 0, limit: 50 });
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
