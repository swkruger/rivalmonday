// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type NavRoleFlags, settingsNavFor } from './nav-items';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

const { SettingsDrillIn } = await import('./settings-drill-in');

const admin: NavRoleFlags = { isAgency: true, isAgencyAdmin: true, isUser: true, homePath: '/agency', dashboard: true, alertRules: true, mcp: true };
const sections = settingsNavFor('agency', admin);

describe('SettingsDrillIn (16b)', () => {
  it('is the "Settings" nav: back link first, then labelled groups of nav items, one current', () => {
    render(<SettingsDrillIn sections={sections} current="/agency/settings/team" back={{ href: '/agency', label: 'Back to Acme Agency' }} />);
    const nav = screen.getByRole('navigation', { name: 'Settings' });
    const links = within(nav).getAllByRole('link');
    expect(links[0]!.textContent).toBe('Back to Acme Agency');
    expect(links[0]!.getAttribute('href')).toBe('/agency');
    expect(links[0]!.hasAttribute('aria-current')).toBe(false);
    expect(links[0]!.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    expect(within(nav).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Agency', 'Plan', 'Growth', 'Integrations', 'Security']);
    expect(links.slice(1).every((l) => l.getAttribute('data-slot') === 'nav-item')).toBe(true);
    expect(links.filter((l) => l.getAttribute('aria-current') === 'page').map((l) => l.getAttribute('href'))).toEqual(['/agency/settings/team']);
  });

  it('an unlabelled section is not a group', () => {
    render(<SettingsDrillIn sections={[{ id: 'main', label: null, items: [{ href: '/c/x/settings/profile', label: 'Business profile', icon: 'profile' }] }]} current={null} back={{ href: '/c/x', label: 'Back to Overview' }} />);
    expect(screen.queryAllByRole('group')).toHaveLength(0);
    expect(screen.queryAllByRole('link').filter((l) => l.getAttribute('aria-current') === 'page')).toHaveLength(0);
  });
});
