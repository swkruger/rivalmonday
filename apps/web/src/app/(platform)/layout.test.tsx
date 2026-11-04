// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ requireContext: vi.fn(), requireOperatorContext: vi.fn(), getViewer: vi.fn(), themeForViewer: vi.fn(), platformRole: vi.fn(), callTool: vi.fn(), startShellReads: vi.fn(), navCookie: undefined as string | undefined }));
vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: async () => ({ get: (n: string) => (n === 'rm_nav_ctx' && m.navCookie !== undefined ? { name: n, value: m.navCookie } : undefined) }) }));
vi.mock('@cs/tools', () => ({ platformRole: m.platformRole }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/runtime-env', () => ({ platformAdmins: () => [] }));
vi.mock('@/server/tools', () => ({ callTool: m.callTool }));
vi.mock('@/server/run-tool', () => ({ runTool: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireContext: m.requireContext, requireOperatorContext: m.requireOperatorContext, getViewer: m.getViewer }));
vi.mock('@/server/theme', () => ({ themeForViewer: m.themeForViewer }));
vi.mock('@/components/shell/app-shell', () => ({
  AppShell: ({ viewer, children, platformRole, zone, fallback }: { viewer: { kind: string }; children: React.ReactNode; platformRole?: string | null; zone?: string; fallback?: unknown }) => (
    <div data-testid="shell" data-kind={viewer.kind} data-role={platformRole ?? ''} data-zone={zone ?? ''} data-fallback={JSON.stringify(fallback ?? null)}>
      {children}
    </div>
  ),
  // Both layouts start the shell batch themselves (launch gate Tasks 4-5); the shell is mocked, so the batch is empty.
  startShellReads: m.startShellReads,
}));
const { default: PlatformLayout, metadata: platformMetadata } = await import('./layout');
const { default: AppLayout, generateMetadata: appMetadata } = await import('../(app)/layout');

beforeEach(() => {
  m.navCookie = undefined;
  m.requireContext.mockReset().mockResolvedValue({ viewer: { kind: 'support' }, ctx: { support: {} } });
  m.requireOperatorContext.mockReset().mockResolvedValue({ viewer: { kind: 'user' }, ctx: {} });
  m.platformRole.mockReset().mockResolvedValue('owner');
  m.callTool.mockReset().mockResolvedValue({ services: [] });
  m.startShellReads.mockReset().mockImplementation(() => Promise.resolve({}));
});

describe('route-group layouts (Phase 8b M5)', () => {
  it('/platform/** renders the operator own context and never resolves the support context', async () => {
    render(await PlatformLayout({ children: <p>page</p> }));
    expect(m.requireOperatorContext).toHaveBeenCalledTimes(1);
    expect(m.requireContext).not.toHaveBeenCalled();
    expect(screen.getByTestId('shell').dataset.kind).toBe('user');
    expect(screen.getByTestId('shell').dataset.zone).toBe('platform');
  });

  it('(app) passes the parsed rm_nav_ctx cookie as the nav fallback and no zone (15a §2.1)', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    m.navCookie = `client:${id}`;
    const { unmount } = render(await AppLayout({ children: <p>page</p> }));
    expect(screen.getByTestId('shell').dataset.zone).toBe('');
    expect(JSON.parse(screen.getByTestId('shell').dataset.fallback!)).toEqual({ context: 'client', clientId: id });
    unmount();
    m.navCookie = 'nonsense';
    render(await AppLayout({ children: <p>page</p> }));
    expect(screen.getByTestId('shell').dataset.fallback).toBe('null');
  });

  it('/agency and /c pages render the (support) context from requireContext', async () => {
    render(await AppLayout({ children: <p>page</p> }));
    expect(m.requireContext).toHaveBeenCalledTimes(1);
    expect(m.requireOperatorContext).not.toHaveBeenCalled();
    expect(screen.getByTestId('shell').dataset.kind).toBe('support');
  });

  const LOW = { service: 'openrouter', label: 'OpenRouter', kind: 'balance', unit: null, status: 'low', amountUsd: 4.5, units: null, capUsd: null, daysLeft: 3.2, unitRateUsd: null };

  it('layout renders the strip for an owner with a low service, and resolves the role once', async () => {
    m.callTool.mockResolvedValue({ services: [LOW, { ...LOW, service: 'apify', status: 'ok' }] });
    render(await PlatformLayout({ children: <p>page</p> }));
    expect(screen.getByRole('region', { name: 'Low balance warning' }).textContent).toContain('OpenRouter balance low: $4.50 · about 3 days left.');
    expect(m.platformRole).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('shell').dataset.role).toBe('owner');
  });

  it('layout renders no strip for staff (and does not read costs) and swallows a tool error', async () => {
    m.platformRole.mockResolvedValue('staff');
    render(await PlatformLayout({ children: <p>page</p> }));
    expect(m.callTool).not.toHaveBeenCalledWith(expect.anything(), 'list_platform_costs', expect.anything());
    expect(screen.queryByRole('region', { name: 'Low balance warning' })).toBeNull();
    cleanup();
    m.platformRole.mockResolvedValue('owner');
    m.callTool.mockRejectedValue(new Error('boom'));
    render(await PlatformLayout({ children: <p>page still renders</p> }));
    expect(screen.getByText('page still renders')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Low balance warning' })).toBeNull();
  });
});

describe('platform layout stages (launch gate Task 5)', () => {
  it('starts the shell batch with the resolved role, and runs costs and guard together, after the access check', async () => {
    const order: string[] = [];
    m.requireOperatorContext.mockImplementation(async () => (order.push('access'), { viewer: { kind: 'user' }, ctx: {} }));
    m.platformRole.mockImplementation(async () => (order.push('role'), 'owner'));
    m.startShellReads.mockImplementation(() => (order.push('shell'), Promise.resolve({})));
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const started: string[] = [];
    m.callTool.mockImplementation(async (_c: unknown, name: string) => {
      started.push(name);
      order.push(name);
      await gate;
      return name === 'get_ai_guard_state' ? { state: 'ok' } : { services: [] };
    });
    const pending = PlatformLayout({ children: <p>page</p> });
    await vi.waitFor(() => expect(started).toHaveLength(2));
    release();
    render(await pending);
    expect(order.slice(0, 3)).toEqual(['access', 'role', 'shell']);
    expect(started.sort()).toEqual(['get_ai_guard_state', 'list_platform_costs']);
    expect(m.startShellReads).toHaveBeenCalledWith({ kind: 'user' }, {}, { zone: 'platform', platformRole: 'owner' });
  });

  it('a non-operator 404s before any read starts', async () => {
    m.requireOperatorContext.mockRejectedValue(new Error('NEXT_NOT_FOUND'));
    await expect(PlatformLayout({ children: <p>page</p> })).rejects.toThrow('NEXT_NOT_FOUND');
    expect(m.platformRole).not.toHaveBeenCalled();
    expect(m.startShellReads).not.toHaveBeenCalled();
    expect(m.callTool).not.toHaveBeenCalled();
  });

  it('a staff viewer gets the guard read and the shell batch, never the cost read', async () => {
    m.platformRole.mockResolvedValue('staff');
    render(await PlatformLayout({ children: <p>page</p> }));
    expect(m.callTool).toHaveBeenCalledTimes(1);
    expect(m.callTool).toHaveBeenCalledWith(expect.anything(), 'get_ai_guard_state', {});
    expect(m.startShellReads).toHaveBeenCalledWith(expect.anything(), expect.anything(), { zone: 'platform', platformRole: 'staff' });
  });
});

describe('AI spend guard banner (7b1)', () => {
  const guard = (state: unknown) =>
    m.callTool.mockImplementation(async (_c: unknown, name: string) => (name === 'get_ai_guard_state' ? state : { services: [] }));

  it('layout shows C8 when paused, nothing when ok', async () => {
    guard({ state: 'paused', scope: 'total', observedUsd: 40, baselineUsd: 10 });
    const { unmount } = render(await PlatformLayout({ children: <p>page</p> }));
    expect(screen.getByRole('region', { name: 'AI spend guard' }).textContent).toContain('All AI calls are paused after a spend spike (all providers).');
    unmount();
    guard({ state: 'ok' });
    render(await PlatformLayout({ children: <p>page</p> }));
    expect(screen.queryByRole('region', { name: 'AI spend guard' })).toBeNull();
  });

  it('shows C7 when warn, to staff as well as owners, and survives a tool error', async () => {
    m.platformRole.mockResolvedValue('viewer');
    guard({ state: 'warn', scope: 'anthropic', observedUsd: 30, baselineUsd: 10 });
    const { unmount } = render(await PlatformLayout({ children: <p>page</p> }));
    expect(screen.getByRole('region', { name: 'AI spend guard' }).textContent).toContain('AI spend is 200% above normal (Anthropic).');
    unmount();
    m.callTool.mockRejectedValue(new Error('boom'));
    render(await PlatformLayout({ children: <p>still here</p> }));
    expect(screen.getByText('still here')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'AI spend guard' })).toBeNull();
  });
});

describe('tab title templates (15a §2.7)', () => {
  it('(app) pages read "{page} · {agency displayName}", from the same viewer branding the shell uses', async () => {
    const viewer = { kind: 'user', ctx: {} };
    m.getViewer.mockReset().mockResolvedValue(viewer);
    m.themeForViewer.mockReset().mockResolvedValue({ branding: { displayName: 'Acme Marketing' } });
    expect((await appMetadata()).title).toEqual({ default: 'Acme Marketing', template: '%s · Acme Marketing' });
    expect(m.themeForViewer).toHaveBeenCalledWith(viewer);
  });

  it('(app) with no signed-in viewer falls back to a bare template, never a product name', async () => {
    m.getViewer.mockReset().mockResolvedValue(null);
    m.themeForViewer.mockReset();
    expect((await appMetadata()).title).toEqual({ default: 'Dashboard', template: '%s' });
    m.getViewer.mockResolvedValue({ kind: 'member-less' });
    expect((await appMetadata()).title).toEqual({ default: 'Dashboard', template: '%s' });
    expect(m.themeForViewer).not.toHaveBeenCalled();
  });

  it('platform pages read "{page} · Rival Monday"', () => {
    expect(platformMetadata.title).toEqual({ default: 'Rival Monday', template: '%s · Rival Monday' });
  });
});
