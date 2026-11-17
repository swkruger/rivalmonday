import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ getViewer: vi.fn(), getOperatorViewer: vi.fn(), themed: [] as unknown[], kind: 'platform' as string }));
vi.mock('@/server/request-host', () => ({ requestHost: async () => ({ origin: 'https://x.example', info: { kind: m.kind } }) }));
vi.mock('next/font/local', () => ({ default: () => ({ variable: 'font-inter' }) }));
vi.mock('./globals.css', () => ({}));
vi.mock('@/dev-panel/mount', () => ({ devBanner: async () => null }));
vi.mock('@/server/current-viewer', () => ({ getViewer: m.getViewer, getOperatorViewer: m.getOperatorViewer }));
vi.mock('@/server/theme', () => ({
  themeForViewer: async (v: { name: string } | null) => {
    m.themed.push(v);
    return { style: { '--primary': v?.name === 'support' ? '#aa0000' : '#0000aa' } };
  },
}));
const { default: RootLayout, generateMetadata } = await import('./layout');

const operator = { kind: 'user', name: 'operator' };
beforeEach(() => {
  m.kind = 'platform';
  m.themed.length = 0;
  m.getOperatorViewer.mockReset().mockResolvedValue(operator);
});

const htmlStyle = async () => ((await RootLayout({ children: null })) as { props: { style: Record<string, string> } }).props.style;

describe('RootLayout theme (8b M1)', () => {
  it("themes <html> with the operator's own viewer during a support session, never the target agency", async () => {
    m.getViewer.mockReset().mockResolvedValue({ kind: 'support', name: 'support' });
    expect(await htmlStyle()).toEqual({ '--primary': '#0000aa' });
    expect(m.themed).toEqual([operator]);
  });

  it('themes <html> with the page viewer outside a session (no operator lookup)', async () => {
    const guest = { kind: 'guest', name: 'guest' };
    m.getViewer.mockReset().mockResolvedValue(guest);
    await htmlStyle();
    expect(m.themed).toEqual([guest]);
    expect(m.getOperatorViewer).not.toHaveBeenCalled();
  });
});

describe('tab icons per host (Q4)', () => {
  const NEUTRAL = { icon: [{ url: '/neutral-icon.svg', type: 'image/svg+xml' }] };
  it('platform icons = rm mark + favicon', async () => {
    expect((await generateMetadata()).icons).toEqual({ icon: [{ url: '/brand/rm-mark.svg', type: 'image/svg+xml' }, { url: '/favicon.ico', sizes: 'any' }] });
  });
  it('agency host icons are neutral', async () => {
    m.kind = 'agency';
    expect((await generateMetadata()).icons).toEqual(NEUTRAL);
  });
  it('mcp host icons are neutral', async () => {
    m.kind = 'mcp';
    expect((await generateMetadata()).icons).toEqual(NEUTRAL);
  });
  it('no generator meta', async () => {
    expect(await generateMetadata()).not.toHaveProperty('generator');
  });
});
