// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ viewer: { kind: 'user' } as Record<string, unknown>, ctx: { role: 'client_owner', agencyId: 'a1' } as Record<string, unknown>, state: 'suspended' }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: m.viewer, ctx: m.ctx }) }));
vi.mock('@/server/billing-state', () => ({ billingStateOf: async () => m.state }));
vi.mock('@/server/theme', () => ({ themeForViewer: async () => ({ branding: { displayName: 'Acme Agency', logoUrl: null }, style: {}, assistantName: 'Friday' }) }));
vi.mock('@/components/sign-out-button', () => ({ SignOutButton: () => null }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
const { default: Page } = await import('./page');

beforeEach(() => {
  m.viewer = { kind: 'user' };
  m.ctx = { role: 'client_owner', agencyId: 'a1' };
  m.state = 'suspended';
});
afterEach(cleanup);

describe('/paused (billing, suspended workspace)', () => {
  it('clients and guests see the agency-branded copy with no billing words', async () => {
    for (const [kind, role] of [['user', 'client_owner'], ['user', 'client_viewer'], ['guest', 'client_viewer']] as const) {
      m.viewer = { kind };
      m.ctx = { role, agencyId: 'a1' };
      const { container, unmount } = render(await Page());
      expect(screen.getByText('This workspace is temporarily unavailable. Please contact Acme Agency.')).toBeTruthy();
      expect(container.textContent?.toLowerCase()).not.toMatch(/billing|payment|subscription|invoice/);
      unmount();
    }
  });

  it('an account manager is told to contact the agency admin', async () => {
    m.ctx = { role: 'account_manager', agencyId: 'a1' };
    render(await Page());
    expect(screen.getByText("Your agency's account needs attention. Please contact your agency admin.")).toBeTruthy();
  });

  it('an agency admin goes to billing; a workspace that is not suspended goes home', async () => {
    m.ctx = { role: 'agency_admin', agencyId: 'a1' };
    await expect(Page()).rejects.toThrow('REDIRECT:/agency/settings/billing');
    m.ctx = { role: 'client_owner', agencyId: 'a1' };
    m.state = 'active';
    await expect(Page()).rejects.toThrow('REDIRECT:/');
  });
});
