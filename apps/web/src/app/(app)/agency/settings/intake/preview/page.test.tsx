// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ viewer: { kind: 'user' } as { kind: string }, ctx: { role: 'agency_admin' } as Record<string, unknown>, callTool: vi.fn() }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: m.viewer, ctx: m.ctx }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => m.callTool(...a) }));
vi.mock('@/server/theme', () => ({
  themeForViewer: async () => ({ branding: { displayName: 'Smith Marketing', logoUrl: null, primary: '#123456', secondary: '#654321', accent: '#F5A524', ink: '#0B2540', canvas: '#F6F9FC', panel: '#EEF2F6' } }),
}));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set<string>() }));
vi.mock('@/app/start/actions', () => ({ lookupBusinessAction: vi.fn(), submitIntakeAction: vi.fn() }));
vi.mock('@/app/start/brand', async () => {
  const { themeVars } = await import('@cs/ui');
  return { agencyBrand: (b: { displayName: string; logoUrl: string | null; primary: string; secondary: string }) => ({ kind: 'agency', displayName: b.displayName, logoUrl: b.logoUrl, style: themeVars(b) }) };
});
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ refresh: () => {} }),
}));
const { default: Page } = await import('./page');

const link = (enabled: boolean) => ({ slug: 'smith-co', enabled, url: 'https://app.example/start/smith-co', counts: { newThisMonth: 0, accepted: 0 } });

beforeEach(() => {
  m.viewer = { kind: 'user' };
  m.ctx = { role: 'agency_admin' };
  m.callTool.mockReset();
});

describe('/agency/settings/intake/preview', () => {
  it('preview disables submit and renders no Turnstile', async () => {
    m.callTool.mockResolvedValue(link(true));
    const { container } = render(await Page());
    expect(m.callTool).toHaveBeenCalledWith(m.ctx, 'get_intake_link', {});
    expect(screen.getByRole('heading', { level: 1, name: 'Intake preview' })).toBeTruthy();
    // The embedded landing heading steps down so the page keeps one h1 (PageHeader's).
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Get your free competitor snapshot' })).toBeTruthy();
    expect(screen.getByText('Preview — this is what visitors see')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Find my business' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Get my free snapshot' }) as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('.cf-turnstile')).toBeNull();
    expect(screen.queryByText(/Link is off/)).toBeNull();
  });

  it('preview shows the link-off line when disabled', async () => {
    m.callTool.mockResolvedValue(link(false));
    render(await Page());
    expect(screen.getByText("Link is off · visitors can't open it yet")).toBeTruthy();
  });

  it('preview 404s for account managers and support sessions', async () => {
    m.ctx = { role: 'account_manager' };
    await expect(Page()).rejects.toThrow('NEXT_NOT_FOUND');
    m.viewer = { kind: 'support' };
    m.ctx = { role: 'agency_admin' };
    await expect(Page()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(m.callTool).not.toHaveBeenCalled();
  });
});
