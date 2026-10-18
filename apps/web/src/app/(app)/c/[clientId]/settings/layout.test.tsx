// @vitest-environment jsdom
import { createAccessContext } from '@cs/core';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ viewer: null as unknown, billingEnabled: false }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => m.viewer }));
vi.mock('@/server/client-billing-state', () => ({ clientBillingNoticeOf: async () => ({ paused: false, paymentNeeded: false, enabled: m.billingEnabled }) }));
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); },
  usePathname: () => `/c/${C}/settings/profile`,
}));

const { default: SettingsLayout } = await import('./layout');
const { default: SettingsIndex } = await import('./page');

const A = '00000000-0000-0000-0000-00000000000a';
const C = '00000000-0000-0000-0000-00000000000c';
type Role = 'agency_admin' | 'account_manager' | 'client_owner' | 'client_viewer';
type Feature = 'dashboard' | 'alert_rules' | 'mcp';
const ALL: Feature[] = ['dashboard', 'alert_rules', 'mcp'];
const as = (kind: 'user' | 'guest' | 'support', role: Role, features: Feature[] = ALL, billing = false) => {
  const agency = role === 'agency_admin' || role === 'account_manager';
  const ctx = createAccessContext({ agencyId: A, userId: kind === 'guest' ? 'contact:x' : 'u', role, clientScope: agency ? 'all' : [C], features: features as never });
  m.viewer = { viewer: { kind, ctx }, ctx };
  m.billingEnabled = billing;
};
const params = Promise.resolve({ clientId: C });
const nav = () => screen.queryByRole('navigation', { name: 'Settings' });
const tabs = () => within(nav()!).getAllByRole('link').map((l) => l.textContent);

afterEach(cleanup);

describe('Client settings layout (15a §2.5)', () => {
  it('shows the agency tabs for this client and the page, and no h1 of its own (each page’s PageHeader is the one h1)', async () => {
    as('user', 'agency_admin');
    render(await SettingsLayout({ children: <p>page body</p>, params }));
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(tabs()).toEqual(['Business profile', 'Delivery', 'Alert rules', 'AI connection']);
    expect(within(nav()!).getByRole('link', { name: 'Business profile' }).getAttribute('href')).toBe(`/c/${C}/settings/profile`);
    expect(screen.getByText('page body')).toBeTruthy();
  });

  it('gives a client owner with billing on Billing and no Delivery', async () => {
    as('user', 'client_owner', ALL, true);
    render(await SettingsLayout({ children: null, params }));
    expect(tabs()).toEqual(['Business profile', 'Alert rules', 'AI connection', 'Billing']);
  });

  it('hides Billing while billing is off for the client, and the feature-gated tabs without their features', async () => {
    as('user', 'client_owner', ['alert_rules']);
    render(await SettingsLayout({ children: null, params }));
    expect(tabs()).toEqual(['Alert rules']);
  });

  it('keeps the agency tabs in a support session (no AI connection: tokens are user-only)', async () => {
    as('support', 'agency_admin');
    render(await SettingsLayout({ children: null, params }));
    expect(tabs()).toEqual(['Business profile', 'Delivery', 'Alert rules']);
  });

  it('still renders the page for a guest, with no settings header or sub-nav (the page keeps its own guard)', async () => {
    as('guest', 'client_viewer');
    render(await SettingsLayout({ children: <p>page body</p>, params }));
    expect(screen.getByText('page body')).toBeTruthy();
    expect(nav()).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Client settings' })).toBeNull();
  });

  it('still renders the page when no tab is visible (a client owner on the Billing page with billing off)', async () => {
    as('user', 'client_owner', []);
    render(await SettingsLayout({ children: <p>billing page</p>, params }));
    expect(screen.getByText('billing page')).toBeTruthy();
    expect(nav()).toBeNull();
  });
});

describe('client settings page titles', () => {
  it('each tab page is titled with its tab label', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const { settingsNavFor } = await import('@/components/shell/nav-items');
    const here = dirname(fileURLToPath(import.meta.url));
    const flags = { isAgency: false, isAgencyAdmin: false, isUser: true, homePath: '/c/x', dashboard: true, alertRules: true, mcp: true, clientBilling: true };
    const agency = { ...flags, isAgency: true, homePath: '/agency' };
    const items = [...settingsNavFor('client', agency, 'x'), ...settingsNavFor('client', flags, 'x')].flatMap((s) => s.items);
    const labels = new Map(items.map((i) => [i.href.slice('/c/x/settings/'.length), i.label]));
    expect([...labels.keys()].sort()).toEqual(['ai', 'alerts', 'billing', 'delivery', 'profile']);
    for (const [dir, label] of labels) {
      const source = readFileSync(join(here, dir, 'page.tsx'), 'utf8');
      const titles = [...source.matchAll(/<PageHeader[^>]*\btitle="([^"]*)"/g)].map((x) => x[1]);
      // Every PageHeader on the page (profile has two branches); page-titles.test.ts checks no page renders its own h1.
      expect(titles.length, dir).toBeGreaterThan(0);
      for (const t of titles) expect(t, dir).toBe(label);
    }
  });
});

describe('/c/<id>/settings index', () => {
  it('sends an agency user to Business profile', async () => {
    as('user', 'account_manager');
    await expect(SettingsIndex({ params })).rejects.toThrow(`NEXT_REDIRECT /c/${C}/settings/profile`);
  });

  it('sends a client owner without the dashboard to their first visible tab', async () => {
    as('user', 'client_owner', ['mcp'], true);
    await expect(SettingsIndex({ params })).rejects.toThrow(`NEXT_REDIRECT /c/${C}/settings/ai`);
  });

  it('404s for a guest', async () => {
    as('guest', 'client_viewer');
    await expect(SettingsIndex({ params })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('404s when no tab is visible', async () => {
    as('user', 'client_viewer', []);
    await expect(SettingsIndex({ params })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
