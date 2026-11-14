import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ host: { origin: 'https://app.example', info: { kind: 'platform' } } as unknown, hosts: [] as unknown[] }));
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); } }));
vi.mock('@/server/current-viewer', () => ({ getViewer: async () => null }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ authSecret: 's'.repeat(40), google: { clientId: 'g', clientSecret: 'g' } }) }));
vi.mock('@/server/request-host', () => ({ requestHost: async () => m.host }));
vi.mock('@/server/branding', async (orig) => ({
  ...(await orig<typeof import('@/server/branding')>()),
  authBranding: async (_s: unknown, _e: unknown, _hint: unknown, host: unknown) => { m.hosts.push(host); return null; },
}));

const { default: SignInPage } = await import('./page');
type El = { props: { children: { props: { googleEnabled: boolean } } } };
const googleOn = async () => ((await SignInPage({ searchParams: Promise.resolve({}) })) as unknown as El).props.children.props.googleEnabled;

describe('sign-in page per host (13a1)', () => {
  it('offers Google only on the platform host, and brands by the request host', async () => {
    m.host = { origin: 'https://app.example', info: { kind: 'platform' } };
    expect(await googleOn()).toBe(true);
    m.host = { origin: 'https://acme.neutral.example', info: { kind: 'agency', agencyId: 'a', canonical: true, canonicalOrigin: 'https://acme.neutral.example' } };
    expect(await googleOn()).toBe(false);
    m.host = { origin: 'https://mcp.neutral.example', info: { kind: 'mcp' } };
    expect(await googleOn()).toBe(false);
    expect(m.hosts.map((h) => (h as { kind: string }).kind)).toEqual(['platform', 'agency', 'mcp']);
  });
});
