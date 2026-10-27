// @vitest-environment jsdom
import { createAccessContext } from '@cs/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFridayDock } from '@/components/ask/friday-dock';
import { useHelp } from '@/components/help/help-context';
import { HelpProvider } from '@/components/help/help-provider';

const m = vi.hoisted(() => ({
  ctx: null as unknown, viewer: { kind: 'user' } as { kind: string }, name: null as string | null, reads: 0,
  calls: [] as string[], starters: { questions: ['What changed?'], reviewAllowed: true } as unknown,
}));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: m.viewer, ctx: m.ctx }) }));
vi.mock('@/server/help', () => ({ helpClientName: async () => { m.reads++; return m.name; } }));
vi.mock('@/server/tools', () => ({ tryCallTool: async (_ctx: unknown, name: string) => { m.calls.push(name); return name === 'get_ask_starters' ? m.starters : null; } }));
vi.mock('@/server/ask', () => ({ assistantNameForRequest: async () => 'Friday' }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@cs/mcp', () => ({ displayNameFor: async () => null }));
vi.mock('@/app/(app)/kb/actions', () => ({ loadKbArticle: vi.fn(), loadPageGuide: vi.fn() }));
vi.mock('./ask/actions',() => ({ saveAskRecommendation: vi.fn(), askEvidenceRefs: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/c/x', useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }) }));
const { default: ClientLayout } = await import('./layout');

const A = '00000000-0000-4000-8000-00000000000a';
const C = '00000000-0000-4000-8000-0000000000c1';
const as = (role: 'agency_admin' | 'client_owner', features: 'ask'[] = [], userId = 'u') => {
  m.ctx = createAccessContext({ agencyId: A, userId, role, clientScope: role === 'agency_admin' ? 'all' : [C], features });
};
function Probe() {
  const { names } = useHelp();
  return <p data-testid="p">{names.client ?? 'none'}|{names.agency}|{names.assistant}</p>;
}
const shell = (children: React.ReactNode) => (
  <HelpProvider value={{ audience: 'agency', names: { agency: 'Acme', assistant: 'Friday' } }}>{children}</HelpProvider>
);
afterEach(() => {
  cleanup();
  m.reads = 0;
  m.name = null;
  m.calls = [];
  m.viewer = { kind: 'user' };
  m.starters = { questions: ['What changed?'], reviewAllowed: true };
});
function DockProbe() {
  const d = useFridayDock();
  return <p data-testid="dock">{d ? d.assistantName : 'none'}</p>;
}
const dockOf = async () => {
  render(shell(await ClientLayout({ children: <DockProbe />, params: Promise.resolve({ clientId: C }) })));
  return screen.getByTestId('dock').textContent;
};

describe('client layout (R8)', () => {
  it('gives agency viewers the client name, keeping the rest of the help value', async () => {
    as('agency_admin');
    m.name = 'Bob HVAC';
    render(shell(await ClientLayout({ children: <Probe />, params: Promise.resolve({ clientId: C }) })));
    expect(screen.getByTestId('p').textContent).toBe('Bob HVAC|Acme|Friday');
  });
  it('is a plain pass-through when the name is unreadable (no refusal) and for a non-uuid id', async () => {
    as('agency_admin');
    render(shell(await ClientLayout({ children: <Probe />, params: Promise.resolve({ clientId: C }) })));
    expect(screen.getByTestId('p').textContent).toBe('none|Acme|Friday');
    cleanup();
    render(shell(await ClientLayout({ children: <Probe />, params: Promise.resolve({ clientId: 'nope' }) })));
    expect(screen.getByTestId('p').textContent).toBe('none|Acme|Friday');
  });
  it('makes no read for client roles (the shell already knows their client)', async () => {
    as('client_owner');
    render(shell(await ClientLayout({ children: <Probe />, params: Promise.resolve({ clientId: C }) })));
    expect(m.reads).toBe(0);
  });
});

describe('client layout Friday dock (16d P6)', () => {
  it('wraps a user with the ask channel in the dock', async () => {
    as('client_owner', ['ask']);
    m.name = 'Bob HVAC';
    expect(await dockOf()).toBe('Friday');
    expect(m.calls).toContain('get_ask_starters');
  });

  it('agency viewers keep the help name and get the dock', async () => {
    as('agency_admin', ['ask']);
    m.name = 'Bob HVAC';
    render(shell(await ClientLayout({ children: <><Probe /><DockProbe /></>, params: Promise.resolve({ clientId: C }) })));
    expect(screen.getByTestId('p').textContent).toBe('Bob HVAC|Acme|Friday');
    expect(screen.getByTestId('dock').textContent).toBe('Friday');
  });

  it('guest, support, contact and no-ask viewers get no dock and no starters read', async () => {
    as('client_owner', ['ask']);
    m.viewer = { kind: 'guest' };
    expect(await dockOf()).toBe('none');
    cleanup();
    m.viewer = { kind: 'support' };
    expect(await dockOf()).toBe('none');
    cleanup();
    m.viewer = { kind: 'user' };
    as('client_owner', ['ask'], 'contact:abc');
    expect(await dockOf()).toBe('none');
    cleanup();
    as('client_owner', []);
    expect(await dockOf()).toBe('none');
    expect(m.calls).not.toContain('get_ask_starters');
  });

  it('a refused starters read leaves the children unchanged', async () => {
    as('client_owner', ['ask']);
    m.name = 'Bob HVAC';
    m.starters = null;
    expect(await dockOf()).toBe('none');
  });

  it('an unreadable client profile leaves the children unchanged', async () => {
    as('client_owner', ['ask']);
    expect(await dockOf()).toBe('none');
  });
});
