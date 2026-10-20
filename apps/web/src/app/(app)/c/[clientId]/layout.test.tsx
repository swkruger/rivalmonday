// @vitest-environment jsdom
import { createAccessContext } from '@cs/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HelpProvider, useHelp } from '@/components/help/help-context';

const m = vi.hoisted(() => ({ ctx: null as unknown, name: null as string | null, reads: 0 }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: m.ctx }) }));
vi.mock('@/server/help', () => ({ helpClientName: async () => { m.reads++; return m.name; } }));
const { default: ClientLayout } = await import('./layout');

const A = '00000000-0000-4000-8000-00000000000a';
const C = '00000000-0000-4000-8000-0000000000c1';
const as = (role: 'agency_admin' | 'client_owner') => {
  m.ctx = createAccessContext({ agencyId: A, userId: 'u', role, clientScope: role === 'agency_admin' ? 'all' : [C], features: [] });
};
function Probe() {
  const { names } = useHelp();
  return <p data-testid="p">{names.client ?? 'none'}|{names.agency}|{names.assistant}</p>;
}
const shell = (children: React.ReactNode) => (
  <HelpProvider value={{ audience: 'agency', names: { agency: 'Acme', assistant: 'Friday' } }}>{children}</HelpProvider>
);
afterEach(() => { cleanup(); m.reads = 0; m.name = null; });

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
