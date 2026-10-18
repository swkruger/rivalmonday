// @vitest-environment jsdom
import { createAccessContext } from '@cs/core';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ viewer: null as unknown }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => m.viewer }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); },
  usePathname: () => '/agency/settings/team',
}));

const { default: SettingsLayout } = await import('./layout');
const { default: SettingsIndex } = await import('./page');

const A = '00000000-0000-0000-0000-00000000000a';
const C = '00000000-0000-0000-0000-00000000000c';
type Role = 'agency_admin' | 'account_manager' | 'client_owner';
const as = (kind: 'user' | 'support', role: Role, clientScope: 'all' | string[] = role === 'client_owner' ? [C] : 'all') => {
  const ctx = createAccessContext({ agencyId: A, userId: 'u', role, clientScope, features: [] });
  m.viewer = { viewer: { kind, ctx }, ctx };
};

const tabs = () => within(screen.getByRole('navigation', { name: 'Settings' })).getAllByRole('link').map((l) => l.textContent);

afterEach(cleanup);

describe('Agency settings layout (15a §2.5)', () => {
  it('shows every tab for an admin and the page, and no h1 of its own (each page’s PageHeader is the one h1)', async () => {
    as('user', 'agency_admin');
    render(await SettingsLayout({ children: <p>page body</p> }));
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(tabs()).toEqual(['Branding & voice', 'Team', 'Playbooks', 'Billing', 'Usage & limits', 'Intake link', 'Slack & Teams', 'AI connections', 'Platform access']);
    expect(screen.getByText('page body')).toBeTruthy();
  });

  it.each<[string, 'all' | string[]]>([
    ['scoped', [C]],
    ['all', 'all'],
  ])('hides the admin-only tabs from an account manager (%s scope)', async (_label, scope) => {
    as('user', 'account_manager', scope);
    render(await SettingsLayout({ children: null }));
    expect(tabs()).toEqual(['Team', 'Playbooks', 'Usage & limits', 'AI connections']);
  });

  it('hides the tabs that 404 in a support session', async () => {
    as('support', 'agency_admin');
    render(await SettingsLayout({ children: null }));
    expect(tabs()).toEqual(['Branding & voice', 'Team', 'Playbooks', 'Usage & limits', 'Slack & Teams', 'AI connections']);
  });

  it('404s for client roles', async () => {
    as('user', 'client_owner');
    await expect(SettingsLayout({ children: null })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('settings page titles', () => {
  it('each tab page is titled with its tab label', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const { settingsNavFor } = await import('@/components/shell/nav-items');
    const here = dirname(fileURLToPath(import.meta.url));
    const admin = { isAgency: true, isAgencyAdmin: true, isUser: true, homePath: '/agency', dashboard: true, alertRules: true, mcp: true };
    for (const item of settingsNavFor('agency', admin).flatMap((s) => s.items)) {
      const source = readFileSync(join(here, item.href.slice('/agency/settings/'.length), 'page.tsx'), 'utf8');
      // The page's PageHeader title, under the "Agency settings" breadcrumb root.
      expect(source, item.href).toMatch(new RegExp(`<PageHeader[^>]*\\btitle="${item.label}"`));
      expect(source, item.href).toMatch(/breadcrumb=\{\[\{ label: 'Agency settings', href: '\/agency\/settings' \}/);
    }
  });
});

describe('/agency/settings index', () => {
  it('sends an admin to the first tab (Branding & voice)', async () => {
    as('user', 'agency_admin');
    await expect(SettingsIndex()).rejects.toThrow('NEXT_REDIRECT /agency/settings/branding');
  });

  it('sends an account manager to Team', async () => {
    as('user', 'account_manager');
    await expect(SettingsIndex()).rejects.toThrow('NEXT_REDIRECT /agency/settings/team');
  });

  it('404s when no tab is visible', async () => {
    as('user', 'client_owner');
    await expect(SettingsIndex()).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
