// Launch-gate 6a: the theme and guide reads join the setup batch, and an out-of-scope client still 404s.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const C = '00000000-0000-4000-8000-0000000000c1';
const callTool = vi.fn();
const theme = vi.fn();
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: 'agency_admin' }, viewer: { kind: 'user' } }) }));
vi.mock('@/server/help', () => ({ helpGuides: (...a: unknown[]) => callTool(null, 'help', ...a) }));
vi.mock('@/server/theme', () => ({ themeForViewer: (...a: unknown[]) => theme(...a) }));
vi.mock('@/app/(app)/kb/actions', () => ({ loadPageGuide: vi.fn() }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), tryCallTool: (...a: unknown[]) => callTool(...a), registry: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); },
  usePathname: () => `/c/${C}/setup`,
}));

const { default: SetupPage } = await import('./page');
const visit = () => SetupPage({ params: Promise.resolve({ clientId: C }), searchParams: Promise.resolve({}) });

describe('Setup page reads (launch-gate 6a)', () => {
  beforeEach(() => { callTool.mockReset(); theme.mockReset(); });

  it('reads the theme and the guides beside get_client_setup, not after it', async () => {
    callTool.mockImplementation(() => new Promise(() => {}));
    theme.mockImplementation(() => new Promise(() => {}));
    void visit();
    await new Promise((r) => setTimeout(r, 0));
    expect(callTool.mock.calls.map((c) => c[1])).toEqual(['get_client_setup', 'get_client_profile', 'get_client_details', 'help']);
    expect(theme).toHaveBeenCalledWith({ kind: 'user' });
  });

  it('an out-of-scope client still 404s, with no unhandled rejections', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    callTool.mockImplementation(async () => { throw new Error('NEXT_NOT_FOUND'); });
    theme.mockImplementation(async () => ({ branding: { displayName: 'B', logoUrl: null } }));
    const err = await visit().then(() => null, (e: unknown) => e);
    expect((err as Error | null)?.message).toBe('NEXT_NOT_FOUND');
    await new Promise((r) => setTimeout(r, 20));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });
});
