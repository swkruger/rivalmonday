// @vitest-environment jsdom
import { resolveBranding } from '@cs/email';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Metadata } from 'next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 15a §2.10 / D12 white-label leak guard: everything a client of a white-label agency sees — the client shell, the
 * sign-in pages (with a client `next`, and neutral without one), the evidence page and the AI connections block — and
 * their `<title>`s never name the product. The wordmark renders "rival"/"monday" as two spans, so text AND markup are
 * checked.
 */
const C = '00000000-0000-4000-8000-0000000000c1';
const AG = '00000000-0000-4000-8000-0000000000a9';
const WHITE_LABEL = resolveBranding('Acme Marketing LLC', { displayName: 'Cool Comfort', primary: '#7A3EE8' });
const LEAK = /rival[\s-]*monday/i;

const m = vi.hoisted(() => ({ viewer: null as unknown, ctx: null as unknown, hints: [] as unknown[] }));
let pathname = '/c/x';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); }, notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));
vi.mock('@/server/current-viewer', () => ({
  getViewer: async () => m.viewer, getOperatorViewer: async () => m.viewer,
  requireContext: async () => ({ viewer: m.viewer, ctx: m.ctx }), requireViewer: async () => m.viewer,
}));
vi.mock('@/server/theme', () => ({ themeForViewer: async () => ({ branding: WHITE_LABEL, style: { '--primary': WHITE_LABEL.primary }, assistantName: 'Sunny' }) }));
// Pages that know the client brand by its agency; anything else gets the neutral card (no DEFAULT_AGENCY_ID here).
vi.mock('@/server/branding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/branding')>()),
  authBranding: async (_s: unknown, _e: unknown, hint: { clientId?: string } | null) => {
    m.hints.push(hint);
    return hint?.clientId === C ? WHITE_LABEL : null;
  },
}));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {}, app: {} }) }));
vi.mock('@/server/env', () => ({ webEnv: () => ({ appUrl: 'https://app.example', authSecret: 's'.repeat(40), google: null, defaultAgencyId: null }) }));
vi.mock('@/server/tools', () => {
  const callTool = async (_ctx: unknown, name: string, input?: { query?: string }) => {
    if (name === 'list_help_guides') return { guides: [{ helpKey: 'page:client.overview', title: 'Overview', articleId: '00000000-0000-4000-8000-0000000000b1' }] };
    if (name === 'search_knowledge') return { results: [{ kbId: '00000000-0000-4000-8000-0000000000b1', title: 'Overview', chunks: [`Matches for ${input?.query}.`] }] };
    if (name === 'get_client_profile') return { id: C, name: 'Lone Star Cooling' };
    if (name === 'get_evidence') {
      return {
        evidenceId: '00000000-0000-4000-8000-0000000000e1', kind: 'screenshot', sha256: 'ab'.repeat(32), bytes: 10, contentType: 'image/png', captureId: '00000000-0000-4000-8000-0000000000e2',
        capturedAt: '2026-10-14T02:00:00.000Z', captureStatus: 'ok', channel: 'web', channelLabel: 'Website', url: 'https://smith.example/pricing', collectorVersion: 'web@1', legalHold: false,
        competitorId: '00000000-0000-4000-8000-0000000000f1', competitorName: 'Smith HVAC', servable: true, citedBy: [],
      };
    }
    return { items: [] };
  };
  return { callTool, tryCallTool: callTool };
});
vi.mock('@/server/client-billing-state', () => ({ clientBillingNoticeOf: async () => null }));
vi.mock('@/server/runtime-env', () => ({ platformAdmins: () => [] }));
vi.mock('@/server/nav', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/server/nav')>()), navCounts: async () => ({}) }));
vi.mock('@/server/ask', () => ({ assistantNameFor: async () => 'Sunny' }));
vi.mock('@/server/billing-state', () => ({ billingSnapshotOf: async () => null }));
vi.mock('@/server/billing-redirect', () => ({ billingRedirectFor: () => null }));
vi.mock('@/server/run-tool', () => ({ runTool: async () => ({ ok: true }) }));
vi.mock('@cs/tools', async (importOriginal) => ({ ...(await importOriginal<typeof import('@cs/tools')>()), unreadCount: async () => 0, platformRole: async () => null }));
vi.mock('@/lib/auth-client', () => ({ authClient: { signIn: { magicLink: vi.fn(), social: vi.fn() }, signOut: vi.fn() } }));
vi.mock('@/app/(app)/actions', () => ({ switchMembership: vi.fn() }));
vi.mock('@/app/(app)/c/[clientId]/ask/actions', () => ({ saveAskRecommendation: vi.fn() }));

const { AppShell } = await import('@/components/shell/app-shell');
const { generateMetadata: appMetadata } = await import('@/app/(app)/layout');
const SignIn = await import('@/app/sign-in/page');
const CheckEmail = await import('@/app/sign-in/check-email/page');
const LinkExpired = await import('@/app/link-expired/page');
const LinkOther = await import('@/app/link-other-account/page');
const NoAccess = await import('@/app/no-access/page');
const Evidence = await import('@/app/(app)/c/[clientId]/evidence/[evidenceId]/page');
const { ConnectorUrlCard } = await import('@/components/ai-connections');
const { AskChat } = await import('@/components/ask/ask-chat');
const ClientHelp = await import('@/app/(app)/c/[clientId]/help/page');
const { HelpProvider } = await import('@/components/help/help-context');
const { HelpTip } = await import('@/components/help/help-tip');
const { PageGuide } = await import('@/components/help/page-guide');
const { PAGE_COPY, renderCopy } = await import('@/help/copy');
const { renderKbText, NEUTRAL_AGENCY_NAME, GLOSSARY } = await import('@cs/core');
const { readdirSync, readFileSync } = await import('node:fs');
const { join } = await import('node:path');

const ctx = { agencyId: AG, userId: 'u1', role: 'client_owner', clientScope: [C], features: new Set(['dashboard', 'ask', 'mcp']) };
const membership = { id: 'm1', agencyId: AG, agencyName: 'Acme Marketing LLC', role: 'client_owner', clientId: C, clientName: 'Lone Star Cooling', clientScope: null, contactId: null };
const owner = { kind: 'user', userId: 'u1', email: 'owner@example.com', name: 'Olive Owner', ctx, membership, memberships: [membership] };

const out: string[] = [];
const grab = (node: React.ReactElement) => {
  const { container, unmount } = render(node);
  out.push(container.innerHTML, container.textContent ?? '');
  const text = container.textContent ?? '';
  unmount();
  return text;
};
const titleOf = (md: Metadata) => JSON.stringify(md.title);
const sp = (q: Record<string, string>) => ({ searchParams: Promise.resolve(q) });

beforeEach(() => {
  out.length = 0;
  m.hints.length = 0;
  m.viewer = owner;
  m.ctx = ctx;
  pathname = `/c/${C}`;
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
  }
});
afterEach(cleanup);

describe('white-label leak guard (15a §2.10)', () => {
  it('the client shell for a client owner and its tab title', async () => {
    const text = grab(await AppShell({ viewer: owner as never, ctx: ctx as never, children: <p>page</p> }));
    expect(text).toContain('Cool Comfort');
    const md = await appMetadata();
    expect(titleOf(md)).toContain('· Cool Comfort');
    out.push(titleOf(md));
    expect(out.join('\n')).not.toMatch(LEAK);
  });

  it("sign-in and check-email with a client next wear that client's agency, title included", async () => {
    m.viewer = null;
    const next = `/c/${C}/briefs`;
    expect(grab(await SignIn.default(sp({ next, email: 'owner@example.com' })))).toContain('Cool Comfort');
    expect(m.hints).toContainEqual({ clientId: C });
    const signInTitle = (await SignIn.generateMetadata(sp({ next }))).title;
    expect(signInTitle).toBe('Sign in · Cool Comfort');
    expect(grab(await CheckEmail.default(sp({ next })))).toContain('Cool Comfort');
    const checkTitle = (await CheckEmail.generateMetadata(sp({ next }))).title;
    expect(checkTitle).toBe('Check your email · Cool Comfort');
    out.push(String(signInTitle), String(checkTitle));
    expect(out.join('\n')).not.toMatch(LEAK);
  });

  it('auth pages that cannot tell the agency are neutral: no wordmark, no product name, bare titles', async () => {
    m.viewer = null;
    const titles: unknown[] = [];
    grab(await SignIn.default(sp({})));
    titles.push((await SignIn.generateMetadata(sp({}))).title);
    grab(await SignIn.default(sp({ next: '/c/not-a-uuid/briefs' })));
    grab(await CheckEmail.default(sp({})));
    titles.push((await CheckEmail.generateMetadata(sp({}))).title);
    grab(await LinkExpired.default());
    titles.push((await LinkExpired.generateMetadata()).title);
    m.viewer = { kind: 'user', userId: 'u2', email: 'other@example.com', name: 'Other' };
    grab(await LinkOther.default());
    titles.push((await LinkOther.generateMetadata()).title);
    m.viewer = { kind: 'member-less', userId: 'u3', email: 'new@example.com', name: 'New' };
    grab(await NoAccess.default());
    titles.push((await NoAccess.generateMetadata()).title);
    expect(titles).toEqual(['Sign in', 'Check your email', 'Link expired', 'Different account', 'No workspace yet']);
    out.push(JSON.stringify(titles));
    expect(out.join('\n')).not.toMatch(LEAK);
    expect(out.join('\n')).not.toContain('Cool Comfort');
  });

  it('the evidence page (web capture) and its title', async () => {
    const params = { params: Promise.resolve({ clientId: C, evidenceId: '00000000-0000-4000-8000-0000000000e1' }) };
    const text = grab(await Evidence.default(params));
    expect(text).toContain('Website · captured by our monitoring service');
    out.push(titleOf(await Evidence.generateMetadata(params)));
    expect(out.join('\n')).not.toMatch(LEAK);
  });

  it('the Ask review disclosure: the white-label service name, else "our support team" (fix round 1)', () => {
    const chat = { clientId: C, threadId: null, assistantName: 'Sunny', starters: [], reviewAllowed: true, messages: [], confirmAction: vi.fn(), saveAction: vi.fn() };
    expect(grab(<AskChat {...chat} productName={WHITE_LABEL.displayName} />)).toContain('Conversations may be reviewed by Cool Comfort to improve answers.');
    const neutral = grab(<AskChat {...chat} productName={null} />);
    expect(neutral).toContain('Conversations may be reviewed by our support team to improve answers.');
    expect(neutral).not.toContain('Acme Marketing');
    expect(out.join('\n')).not.toMatch(LEAK);
  });

  it('the AI connections block names the agency in the Claude Code command', () => {
    expect(grab(<ConnectorUrlCard url="https://app.example/mcp" displayName={WHITE_LABEL.displayName} />)).toContain('claude mcp add --transport http cool-comfort https://app.example/mcp');
    grab(<ConnectorUrlCard url="https://app.example/mcp" displayName={null} />);
    expect(out.join('\n')).not.toMatch(LEAK);
  });

  it('the client Help page (guides, search results, glossary, Ask link) and its title', async () => {
    const params = { params: Promise.resolve({ clientId: C }) };
    const text = grab(await ClientHelp.default({ ...params, ...sp({ q: 'heatmap' }) }));
    expect(text).toContain('Matches for heatmap.');
    expect(text).toContain('Ask Sunny');
    expect(text).toContain('Glossary');
    out.push(titleOf(ClientHelp.metadata as Metadata));
    expect(out.join('\n')).not.toMatch(LEAK);
  });

  it('the page guide sheet names the white-label assistant, never the product', async () => {
    const guide = { id: '00000000-0000-4000-8000-0000000000b1', title: 'Overview', sections: [{ heading: 'What this page tells you', markdown: 'Your home page.' }] };
    render(
      <HelpProvider value={{ audience: 'client', names: { agency: WHITE_LABEL.displayName, assistant: 'Sunny' } }}>
        <PageGuide helpKey="page:client.overview" pageTitle="Overview" load={async () => ({ guide, canAsk: true })} />
      </HelpProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /guide/i }));
    await waitFor(() => expect(screen.getByRole('link', { name: 'Ask Sunny about this page' })).toBeTruthy());
    out.push(document.body.innerHTML, document.body.textContent ?? '');
    expect(out.join('\n')).not.toMatch(LEAK);
  });

  it('every pilot tip, opened for a client, renders with the agency and assistant names and no product name', () => {
    // Agency-only tips render nothing for a client (HelpTip's audience check); every other tip must open.
    const keys = (Object.keys(PAGE_COPY) as (keyof typeof PAGE_COPY)[]).flatMap((page) =>
      Object.entries(PAGE_COPY[page].tips ?? {}).filter(([, t]) => ['all', 'client'].includes(t.audience ?? 'all')).map(([id]) => `${page}.${id}`));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      const { unmount } = render(
        <HelpProvider value={{ audience: 'client', names: { agency: WHITE_LABEL.displayName, assistant: 'Sunny' } }}>
          <HelpTip tip={key as never} />
        </HelpProvider>,
      );
      const trigger = screen.getByRole('button');
      fireEvent.click(trigger);
      expect(trigger.getAttribute('aria-expanded'), key).toBe('true');
      expect(screen.getByRole('dialog').textContent, key).not.toBe('');
      out.push(document.body.innerHTML, document.body.textContent ?? '');
      unmount();
    }
    expect(out.join('\n')).not.toMatch(LEAK);
  });
});

/**
 * 15b-2 (P3): every help string a client role can reach — page descriptions, tips, empty states, guides, glossary — read for
 * a client of a white-label agency that set no display name (neutral "your agency") and for one that did: never the product
 * name, never a placeholder left over, never wording that belongs to the agency side.
 */
describe('help content a client can reach (15b-2)', () => {
  /** Agency-side vocabulary a client-facing string must not use (copy rules: routing, upsell, seats, review queue, AMs, spend, vendors, thresholds). */
  const AGENCY_ONLY = /\b(routing|upsell|seats?|review queue|approvals?|account managers?|spend|DataForSEO|Stadia|OpenRouter|Jev|TypeSafe)\b|confidence threshold/i;
  /** The abbreviation "AM" (account manager), case-sensitive so the word "am" is fine. */
  const AM_WORD = /\bAMs?\b/;
  /** Client routes the client roles never reach: their copy is agency-only by construction. */
  const AGENCY_ONLY_KEYS = new Set(['client.pitch-snapshot', 'client.settings.delivery', 'client.settings.runbook']);
  const SCENARIOS = [
    { label: 'no display name', agency: NEUTRAL_AGENCY_NAME, assistant: 'Friday' },
    { label: 'display name set', agency: 'Cool Comfort', assistant: 'Sunny' },
  ];
  const clientPageKeys = (Object.keys(PAGE_COPY) as (keyof typeof PAGE_COPY)[]).filter((k) =>
    (k.startsWith('client.') && !AGENCY_ONLY_KEYS.has(k)) || k === 'account.inbox' || k === 'account.settings.notifications');
  const visibleToClient = (a?: string) => ['all', 'client'].includes(a ?? 'all');

  const check = (where: string, text: string, problems: string[]) => {
    if (LEAK.test(text)) problems.push(`${where}: names the product`);
    if (/\{\{?\s*\w+\s*\}?\}/.test(text)) problems.push(`${where}: unfilled placeholder`);
    const hit = AGENCY_ONLY.exec(text) ?? AM_WORD.exec(text);
    if (hit) problems.push(`${where}: agency-side wording "${hit[0]}"`);
  };

  it('page descriptions, client-visible tips and empty states', () => {
    const problems: string[] = [];
    for (const s of SCENARIOS) {
      const names = { agency: s.agency, assistant: s.assistant };
      for (const page of clientPageKeys) {
        const copy = PAGE_COPY[page] as { description: string; tips?: Record<string, { title: string; body: string; audience?: string }>; empty?: Record<string, { title: string; body: string; audience?: string }> };
        check(`[${s.label}] ${page} description`, renderCopy(copy.description, names, 'client'), problems);
        for (const [id, t] of Object.entries(copy.tips ?? {})) if (visibleToClient(t.audience)) check(`[${s.label}] ${page}.${id}`, renderCopy(`${t.title} ${t.body}`, names, 'client'), problems);
        for (const [id, e] of Object.entries(copy.empty ?? {})) if (visibleToClient(e.audience)) check(`[${s.label}] ${page} empty ${id}`, renderCopy(`${e.title} ${e.body}`, names, 'client'), problems);
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('every client and all-audience guide, rendered for both agencies', () => {
    const dir = join(__dirname, '..', '..', '..', '..', 'docs', 'help', 'pages');
    const problems: string[] = [];
    let seen = 0;
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
      const md = readFileSync(join(dir, name), 'utf8');
      const audience = /^audience:\s*(\S+)/m.exec(md)?.[1];
      const key = /^help_key:\s*page:(\S+)/m.exec(md)?.[1] ?? '';
      if (!visibleToClient(audience) || AGENCY_ONLY_KEYS.has(key)) continue;
      seen++;
      const body = md.replace(/^---[\s\S]*?\n---/, '');
      for (const s of SCENARIOS) check(`[${s.label}] ${name}`, renderKbText(body, { productName: s.agency, assistantName: s.assistant }), problems);
    }
    expect(seen).toBeGreaterThan(20);
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('the glossary terms a client can see', () => {
    const problems: string[] = [];
    for (const e of GLOSSARY) if (visibleToClient(e.audience)) check(`glossary ${e.id}`, `${e.term} ${e.short} ${e.long ?? ''}`, problems);
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
