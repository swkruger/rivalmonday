// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ requireContext: vi.fn(), requireOperatorContext: vi.fn(), platformRole: vi.fn(), callTool: vi.fn() }));
vi.mock('@cs/tools', () => ({ platformRole: m.platformRole }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@/server/runtime-env', () => ({ platformAdmins: () => [] }));
vi.mock('@/server/tools', () => ({ callTool: m.callTool }));
vi.mock('@/server/current-viewer', () => ({ requireContext: m.requireContext, requireOperatorContext: m.requireOperatorContext }));
vi.mock('@/components/shell/app-shell', () => ({
  AppShell: ({ viewer, children, platformRole }: { viewer: { kind: string }; children: React.ReactNode; platformRole?: string | null }) => (
    <div data-testid="shell" data-kind={viewer.kind} data-role={platformRole ?? ''}>
      {children}
    </div>
  ),
}));
const { default: PlatformLayout } = await import('./layout');
const { default: AppLayout } = await import('../(app)/layout');

beforeEach(() => {
  m.requireContext.mockReset().mockResolvedValue({ viewer: { kind: 'support' }, ctx: { support: {} } });
  m.requireOperatorContext.mockReset().mockResolvedValue({ viewer: { kind: 'user' }, ctx: {} });
  m.platformRole.mockReset().mockResolvedValue('owner');
  m.callTool.mockReset().mockResolvedValue({ services: [] });
});

describe('route-group layouts (Phase 8b M5)', () => {
  it('/platform/** renders the operator own context and never resolves the support context', async () => {
    render(await PlatformLayout({ children: <p>page</p> }));
    expect(m.requireOperatorContext).toHaveBeenCalledTimes(1);
    expect(m.requireContext).not.toHaveBeenCalled();
    expect(screen.getByTestId('shell').dataset.kind).toBe('user');
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
    expect(m.callTool).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Low balance warning' })).toBeNull();
    cleanup();
    m.platformRole.mockResolvedValue('owner');
    m.callTool.mockRejectedValue(new Error('boom'));
    render(await PlatformLayout({ children: <p>page still renders</p> }));
    expect(screen.getByText('page still renders')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Low balance warning' })).toBeNull();
  });
});
