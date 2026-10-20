import { createAccessContext, type Role } from '@cs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  calls: [] as { tool: string; input: Record<string, unknown> }[],
  guides: [] as { helpKey: string; title: string; articleId: string }[],
  results: [] as { kbId: string; title: string; chunks: string[] }[],
  refuse: false,
  fromEmail: null as string | null,
  glossary: [] as string[],
  displayName: 'Acme',
  anyShort: null as string | null,
}));
vi.mock('server-only', () => ({}));
vi.mock('./tools', () => ({
  registry: () => ({ invoke: async () => ({}) }),
  callTool: async (_c: unknown, tool: string, input: Record<string, unknown>) => {
    m.calls.push({ tool, input });
    if (m.refuse) throw new Error('NEXT_NOT_FOUND');
    return { guides: m.guides };
  },
  tryCallTool: async (_c: unknown, tool: string, input: Record<string, unknown>) => {
    m.calls.push({ tool, input });
    return { results: m.results };
  },
}));
vi.mock('./theme', () => ({ themeForViewer: async () => ({ branding: { displayName: m.displayName, fromEmail: m.fromEmail }, assistantName: 'Penny' }) }));
vi.mock('@cs/core', async (orig) => ({
  ...(await orig<typeof import('@cs/core')>()),
  glossaryFor: (a: string) => {
    m.glossary.push(a);
    if (m.anyShort) return [{ id: 't', term: 'Term', audience: a, short: m.anyShort }];
    return a === 'client' ? [{ id: 't', term: 'Term', audience: 'client', short: 'Short for {agency}.' }] : [];
  },
}));
const { loadHelpIndex } = await import('./help-index');

const A = '00000000-0000-4000-8000-00000000000a';
const C = '00000000-0000-4000-8000-0000000000c1';
const ctx = (role: Role) => createAccessContext({ agencyId: A, userId: 'u', role, clientScope: role.startsWith('client') ? [C] : 'all', features: ['dashboard', 'ask'] });
const viewer = (role: Role | 'guest', kind: 'user' | 'guest' | 'support' = 'user') => ({ kind, ctx: ctx(role === 'guest' ? 'client_viewer' : role), email: 'x@y.z' }) as never;

beforeEach(() => {
  m.calls = []; m.guides = []; m.results = []; m.refuse = false; m.fromEmail = null; m.glossary = []; m.displayName = 'Acme'; m.anyShort = null;
});

describe('loadHelpIndex', () => {
  it('groups the guides the list tool returned and links operators to the platform knowledge page', async () => {
    m.guides = [{ helpKey: 'page:platform.agencies', title: 'Agencies', articleId: 'g1' }];
    const r = await loadHelpIndex({ viewer: viewer('agency_admin'), ctx: ctx('agency_admin'), context: 'platform' });
    expect(m.calls[0]).toEqual({ tool: 'list_help_guides', input: { context: 'platform' } });
    expect(r.groups).toEqual([{ heading: 'Customers', guides: m.guides }]);
    expect(r.articleBase).toBe('/platform/knowledge');
    expect(r.results).toBeNull();
  });

  it('a refused guide read propagates (the page 404s)', async () => {
    m.refuse = true;
    await expect(loadHelpIndex({ viewer: viewer('client_owner'), ctx: ctx('client_owner'), context: 'platform' })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('asks the glossary for the viewer audience: operator on platform, agency, client; guests are clients', async () => {
    await loadHelpIndex({ viewer: viewer('agency_admin'), ctx: ctx('agency_admin'), context: 'platform' });
    await loadHelpIndex({ viewer: viewer('account_manager'), ctx: ctx('account_manager'), context: 'agency' });
    await loadHelpIndex({ viewer: viewer('agency_admin'), ctx: ctx('agency_admin'), context: 'client', clientId: C });
    const r = await loadHelpIndex({ viewer: viewer('guest', 'guest'), ctx: ctx('client_viewer'), context: 'client', clientId: C });
    expect(m.glossary).toEqual(['operator', 'agency', 'agency', 'client']);
    expect(r.glossary).toEqual([{ id: 't', term: 'Term', short: 'Short for Acme.' }]);
  });

  it('names: the shell mapping ("your agency" on platform and for the Rival Monday default); {client} reads "the client" to agency staff', async () => {
    m.anyShort = '{agency} for {client}.';
    const short = async (role: Role, context: 'platform' | 'agency' | 'client') =>
      (await loadHelpIndex({ viewer: viewer(role), ctx: ctx(role), context, ...(context === 'client' ? { clientId: C } : {}) })).glossary[0]!.short;
    expect(await short('agency_admin', 'agency')).toBe('Acme for the client.');
    expect(await short('agency_admin', 'platform')).toBe('your agency for the client.');
    expect(await short('client_owner', 'client')).toBe('Acme for your business.');
    m.displayName = 'Rival Monday';
    expect(await short('agency_admin', 'agency')).toBe('your agency for the client.');
    expect(await short('client_owner', 'client')).toBe('your agency for your business.');
  });

  it('searches only with a query: platform passes context, client passes the client id; results are trimmed', async () => {
    m.results = [{ kbId: 'k1', title: 'T', chunks: ['a  b\n c'.padEnd(400, 'x')] }];
    const none = await loadHelpIndex({ viewer: viewer('agency_admin'), ctx: ctx('agency_admin'), context: 'agency', q: '   ' });
    expect(none.results).toBeNull();
    expect(m.calls.some((c) => c.tool === 'search_knowledge')).toBe(false);
    const p = await loadHelpIndex({ viewer: viewer('agency_admin'), ctx: ctx('agency_admin'), context: 'platform', q: ' pricing ' });
    expect(m.calls.at(-1)).toEqual({ tool: 'search_knowledge', input: { query: 'pricing', limit: 8, context: 'platform' } });
    expect(p.query).toBe('pricing');
    expect(p.results?.[0]?.excerpt).toHaveLength(200);
    expect(p.results?.[0]?.excerpt.startsWith('a b c')).toBe(true);
    await loadHelpIndex({ viewer: viewer('client_owner'), ctx: ctx('client_owner'), context: 'client', clientId: C, q: 'x' });
    expect(m.calls.at(-1)).toEqual({ tool: 'search_knowledge', input: { query: 'x', limit: 8, clientId: C } });
  });

  it('Ask: client context with the module on, named for the agency; none for support, agency context or guests', async () => {
    const owner = await loadHelpIndex({ viewer: viewer('client_owner'), ctx: ctx('client_owner'), context: 'client', clientId: C });
    expect(owner.ask).toEqual({ href: `/c/${C}/ask`, label: 'Ask Penny' });
    const support = await loadHelpIndex({ viewer: viewer('agency_admin', 'support'), ctx: ctx('agency_admin'), context: 'client', clientId: C });
    expect(support.ask).toBeNull();
    const agency = await loadHelpIndex({ viewer: viewer('agency_admin'), ctx: ctx('agency_admin'), context: 'agency' });
    expect(agency.ask).toBeNull();
    const guest = await loadHelpIndex({ viewer: viewer('guest', 'guest'), ctx: ctx('client_viewer'), context: 'client', clientId: C });
    expect(guest.ask).toBeNull();
  });

  it('Contact: client roles and guests get the agency address when set; agency roles never; none set means none', async () => {
    m.fromEmail = 'help@acme.test';
    expect((await loadHelpIndex({ viewer: viewer('client_viewer'), ctx: ctx('client_viewer'), context: 'client', clientId: C })).contactEmail).toBe('help@acme.test');
    expect((await loadHelpIndex({ viewer: viewer('guest', 'guest'), ctx: ctx('client_viewer'), context: 'client', clientId: C })).contactEmail).toBe('help@acme.test');
    expect((await loadHelpIndex({ viewer: viewer('agency_admin'), ctx: ctx('agency_admin'), context: 'client', clientId: C })).contactEmail).toBeNull();
    m.fromEmail = null;
    expect((await loadHelpIndex({ viewer: viewer('client_owner'), ctx: ctx('client_owner'), context: 'client', clientId: C })).contactEmail).toBeNull();
  });
});
