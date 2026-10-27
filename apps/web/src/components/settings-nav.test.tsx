// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type NavRoleFlags, settingsNavFor } from './shell/nav-items';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const { SettingsNav } = await import('./settings-nav');

const admin: NavRoleFlags = { isAgency: true, isAgencyAdmin: true, isUser: true, homePath: '/agency', dashboard: true, alertRules: true, mcp: true };
const sections = settingsNavFor('agency', admin);

const current = () => screen.getAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page').map((l) => l.getAttribute('href'));

beforeEach(() => { pathname = '/agency/settings/team'; });
afterEach(cleanup);

describe('SettingsNav (16b: the in-page chip row below lg)', () => {
  it('renders one "Settings" nav, hidden from lg up (guard: two visible "Settings" navs break E2E strict mode)', () => {
    render(<SettingsNav sections={sections} />);
    const nav = screen.getByRole('navigation', { name: 'Settings' });
    expect(nav.className.split(/\s+/)).toContain('lg:hidden');
  });

  it('is one row of every tab in order, with no group headings', () => {
    render(<SettingsNav sections={sections} />);
    const nav = screen.getByRole('navigation', { name: 'Settings' });
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(sections.flatMap((s) => s.items.map((i) => i.label)));
    expect(within(nav).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(sections.flatMap((s) => s.items.map((i) => i.href)));
    expect(within(nav).queryAllByRole('group')).toHaveLength(0);
    expect(within(nav).queryByText('Integrations')).toBeNull();
  });

  it('marks exactly the current tab, including on a sub-path', () => {
    render(<SettingsNav sections={sections} />);
    expect(current()).toEqual(['/agency/settings/team']);
    cleanup();
    pathname = '/agency/settings/billing/client-billing';
    render(<SettingsNav sections={sections} />);
    expect(current()).toEqual(['/agency/settings/billing']);
  });

  it('follows the live pathname on re-render (client-side navigation)', () => {
    const { rerender } = render(<SettingsNav sections={sections} />);
    pathname = '/agency/settings/usage';
    rerender(<SettingsNav sections={sections} />);
    expect(current()).toEqual(['/agency/settings/usage']);
  });

  it('marks the first tab on the bare index, which only redirects there', () => {
    pathname = '/agency/settings';
    render(<SettingsNav sections={sections} />);
    expect(current()).toEqual(['/agency/settings/branding']);
  });

  it('renders an unlabelled section', () => {
    render(<SettingsNav sections={[{ id: 'main', label: null, items: [{ href: '/c/x/settings/profile', label: 'Business profile', icon: 'profile' }] }]} />);
    expect(screen.queryAllByRole('group')).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Business profile' })).toBeTruthy();
  });
});
